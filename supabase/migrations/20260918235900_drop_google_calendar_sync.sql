-- Remove the Google Calendar integration.
-- The app no longer reads or writes any calendar_* column, so the per-block sync state, the profile
-- preference and the triggers that propagated it can go. Calendar event ids are not recoverable
-- afterwards: the events themselves live in Google and are not touched here.
--
-- PRECONDITION: deploy the application version without Calendar code BEFORE applying this file.
-- Older bundles still write calendar_* columns and would fail once they are dropped. The new code
-- runs fine against the old schema (the old triggers fill the columns), so code goes first.
--
-- Ordering: this file sorts before the relevance v3 migration on purpose. The v3 migration recreates
-- public.complete_block_review without the Calendar clause, so it can be applied after this one. If v3
-- is already applied, the function is left alone (it already carries the relevance snapshots) and the
-- final check fails the whole migration if any function still mentions a calendar_* column.
-- Rollback: supabase/rollbacks/20260918235900_drop_google_calendar_sync.down.sql (only before v3 is applied).
-- Run it through a transactional runner (supabase db push / apply_migration), not a bare psql -f.
set local lock_timeout = '5s';

drop trigger if exists apply_profile_calendar_sync_to_blocks on public.student_profiles;
drop trigger if exists inherit_profile_calendar_sync_on_insert on public.question_blocks;
drop function if exists public.apply_profile_calendar_sync_to_blocks();
drop function if exists public.inherit_profile_calendar_sync();

do $mig$
begin
  -- Skip when v3 is present: its complete_block_review also writes the relevance snapshots.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'block_reviews' and column_name = 'relevance_factor'
  ) then
    execute $fn$
create or replace function public.complete_block_review(p_block_id uuid,p_operation_id uuid,p_review jsonb,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_block public.question_blocks;
  v_review public.block_reviews;
  v_expected integer;
  v_profile public.student_profiles;
  v_review_date date;
  v_next_date date;
  v_planned_date date;
  v_interval integer;
  v_today date;
begin
  if v_user is null or p_operation_id is null then raise exception 'Authentication and operation ID required'; end if;
  select * into v_profile from public.student_profiles where user_id = v_user for update;
  if not found then raise exception 'Student profile not found'; end if;
  select * into v_block from public.question_blocks where id = p_block_id and user_id = v_user for update;
  if not found then raise exception 'Block not found'; end if;
  select * into v_review from public.block_reviews where user_id = v_user and operation_id = p_operation_id;
  if found then
    if v_review.block_id <> p_block_id then raise exception 'Operation ID belongs to another block'; end if;
    return jsonb_build_object('block',to_jsonb(v_block),'review',to_jsonb(v_review),'replayed',true);
  end if;
  v_expected := (p_review ->> 'expected_repetitions')::integer;
  if v_expected is null or v_expected <> v_block.repetitions then raise exception 'Review changed; reload the block before saving'; end if;
  if p_changes ->> 'next_review_date' is distinct from p_review ->> 'new_next_review_date' then raise exception 'Inconsistent next review date'; end if;
  v_review_date := (p_review ->> 'review_date')::date;
  v_next_date := (p_review ->> 'new_next_review_date')::date;
  v_planned_date := (p_changes ->> 'planned_review_date')::date;
  v_interval := (p_changes ->> 'interval_days')::integer;
  v_today := (now() at time zone v_profile.timezone)::date;
  if v_review_date is null or v_review_date > v_today or v_review_date < coalesce(v_block.last_review_date,v_block.study_date) then
    raise exception 'Review date must be between the last contact and today';
  end if;
  if v_next_date is null or v_interval is null or v_interval not between 7 and 180 or v_next_date <> v_review_date + v_interval then
    raise exception 'Invalid review interval';
  end if;
  if v_planned_date is not null and v_planned_date < v_today then raise exception 'Planned review date cannot be in the past'; end if;
  insert into public.block_reviews(block_id,user_id,operation_id,review_date,question_count,correct_count,accuracy_percentage,perceived_difficulty,time_spent_minutes,
    sm2_grade_calculated,previous_next_review_date,new_next_review_date,contact_type,engine_version,calculation_mode,performance_band,importance,previous_interval_days,new_interval_days,priority_score)
    values(p_block_id,v_user,p_operation_id,(p_review->>'review_date')::date,(p_review->>'question_count')::integer,(p_review->>'correct_count')::integer,
      (p_review->>'accuracy_percentage')::integer,p_review->>'perceived_difficulty',(p_review->>'time_spent_minutes')::integer,(p_review->>'sm2_grade_calculated')::integer,
      v_block.next_review_date,(p_review->>'new_next_review_date')::date,'review',coalesce(p_review->>'engine_version',v_block.engine_version),
      p_review->>'calculation_mode',p_review->>'performance_band',v_block.importance,v_block.interval_days,(p_changes->>'interval_days')::integer,(p_review->>'priority_score')::numeric)
    returning * into v_review;
  -- Ensure a first migrated completion also leaves an auditable completed occurrence.
  insert into public.weekly_plan_items(user_id,block_id,revision_number,due_week_start,original_due_week_start,week_starts_on,planned_review_date,planning_source)
    select v_user,p_block_id,v_block.repetitions,w,w,extract(dow from w)::integer,v_block.planned_review_date,v_block.planning_source
    from (select public.planning_week_start(v_user,case when v_block.planning_source='manual' then coalesce(v_block.planned_review_date,v_block.next_review_date) else v_block.next_review_date end,p.week_starts_on) w
      from public.student_profiles p where p.user_id = v_user) due on conflict do nothing;
  update public.weekly_plan_items set status = 'completed',completed_at = now(),completed_review_id = v_review.id
    where user_id = v_user and block_id = p_block_id and revision_number = v_block.repetitions;
  update public.question_blocks set question_count = v_review.question_count,correct_count = v_review.correct_count,accuracy_percentage = v_review.accuracy_percentage,
    perceived_difficulty = v_review.perceived_difficulty,time_spent_minutes = v_review.time_spent_minutes,repetitions = repetitions + 1,
    interval_days = (p_changes->>'interval_days')::integer,next_review_date = v_review.new_next_review_date,last_review_date = v_review.review_date,
    planned_review_date = (p_changes->>'planned_review_date')::date,planning_source = 'automatic',backlog_since = null,backlog_urgency = null,
    pre_exam_review_requested = false,performance_band = v_review.performance_band,calculation_mode = coalesce(v_review.calculation_mode,calculation_mode),engine_version = v_review.engine_version
    where id = p_block_id and user_id = v_user returning * into v_block;
  return jsonb_build_object('block',to_jsonb(v_block),'review',to_jsonb(v_review),'replayed',false);
end;
$$;
    $fn$;
  end if;
end
$mig$;

alter table public.question_blocks
  drop constraint if exists question_blocks_calendar_sync_status_check,
  drop column if exists calendar_event_id,
  drop column if exists calendar_sync_enabled,
  drop column if exists calendar_sync_status,
  drop column if exists calendar_last_error,
  drop column if exists calendar_last_synced_at,
  drop column if exists calendar_sync_fingerprint;

alter table public.student_profiles
  drop column if exists calendar_sync_enabled;

-- Fail loudly (and roll everything back) if a function still depends on a dropped column.
do $mig$
declare
  v_leftover text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_leftover
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) ilike '%calendar\_%';
  if v_leftover is not null then
    raise exception 'Functions still reference Calendar columns: %', v_leftover;
  end if;
end
$mig$;
