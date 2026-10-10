-- Rollback for 20260918235900_drop_google_calendar_sync.sql. Restores the Calendar schema as it was on the remote database
-- (weekly migration applied, relevance v3 not applied). Calendar event ids and sync errors are not
-- restored. If v3 is already applied, restore complete_block_review from the v3 migration instead of
-- the function below, adding back its Calendar clause.
set local lock_timeout = '5s';

alter table public.student_profiles
  add column if not exists calendar_sync_enabled boolean not null default false;

alter table public.question_blocks
  add column if not exists calendar_event_id text,
  add column if not exists calendar_sync_enabled boolean not null default true,
  add column if not exists calendar_sync_status text not null default 'pending',
  add column if not exists calendar_last_error text,
  add column if not exists calendar_last_synced_at timestamptz,
  add column if not exists calendar_sync_fingerprint text;

alter table public.question_blocks
  add constraint question_blocks_calendar_sync_status_check
  check (calendar_sync_status in ('pending', 'synced', 'failed', 'disabled'));

create index if not exists question_blocks_user_calendar_sync_status_idx
  on public.question_blocks (user_id, calendar_sync_status);

create index if not exists question_blocks_calendar_reconciliation_idx
  on public.question_blocks (user_id, calendar_sync_status)
  where calendar_sync_enabled = true
    or calendar_event_id is not null;

create or replace function public.apply_profile_calendar_sync_to_blocks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.calendar_sync_enabled is distinct from old.calendar_sync_enabled then
    update public.question_blocks
    set
      calendar_sync_enabled = new.calendar_sync_enabled,
      calendar_sync_status = case
        when new.calendar_sync_enabled then 'pending'
        when calendar_event_id is not null then 'pending'
        else 'disabled'
      end,
      calendar_last_error = null
    where user_id = new.user_id;
  end if;

  return new;
end;
$$;

create trigger apply_profile_calendar_sync_to_blocks
  after update of calendar_sync_enabled
  on public.student_profiles
  for each row
  execute function public.apply_profile_calendar_sync_to_blocks();

create or replace function public.inherit_profile_calendar_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select coalesce(profile.calendar_sync_enabled, false)
  into new.calendar_sync_enabled
  from public.student_profiles as profile
  where profile.user_id = new.user_id;

  new.calendar_sync_enabled := coalesce(new.calendar_sync_enabled, false);
  new.calendar_sync_status := case
    when new.calendar_sync_enabled then 'pending'
    else 'disabled'
  end;
  new.calendar_last_error := null;

  return new;
end;
$$;

create trigger inherit_profile_calendar_sync_on_insert
  before insert
  on public.question_blocks
  for each row
  execute function public.inherit_profile_calendar_sync();

update public.question_blocks as block
set
  calendar_sync_enabled = profile.calendar_sync_enabled,
  calendar_sync_status = case when profile.calendar_sync_enabled then 'pending' else 'disabled' end
from public.student_profiles as profile
where profile.user_id = block.user_id;

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
    pre_exam_review_requested = false,performance_band = v_review.performance_band,calculation_mode = coalesce(v_review.calculation_mode,calculation_mode),engine_version = v_review.engine_version,
    calendar_sync_status = case when calendar_sync_enabled then 'pending' else 'disabled' end,calendar_last_error = null
    where id = p_block_id and user_id = v_user returning * into v_block;
  return jsonb_build_object('block',to_jsonb(v_block),'review',to_jsonb(v_review),'replayed',false);
end;
$$;
