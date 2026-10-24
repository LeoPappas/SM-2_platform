-- Correcting the last session without changing its calculated next review (for
-- example, only the study time) keeps the day the review is planned for, whether
-- the student chose it or the planner did, and leaves the week's late status alone.
-- Only a new calculated date moves the review to the nearest free day again.

create or replace function public.edit_last_block_session(
  p_block_id uuid,
  p_review_id uuid,
  p_expected_repetitions integer,
  p_session jsonb,
  p_planned_review_date date
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.student_profiles;
  v_block public.question_blocks;
  v_session public.block_reviews;
  v_last_id uuid;
  v_previous_date date;
  v_date date := (p_session ->> 'review_date')::date;
  v_questions integer := (p_session ->> 'question_count')::integer;
  v_correct integer := (p_session ->> 'correct_count')::integer;
  v_next date := (p_session ->> 'new_next_review_date')::date;
  v_interval integer := (p_session ->> 'new_interval_days')::integer;
  v_today date;
  v_moves boolean;
  v_source text := case when p_planned_review_date is null then null else 'automatic' end;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  -- Same profile -> block lock order as completion and weekly preparation.
  select * into v_profile from public.student_profiles where user_id = v_user for update;
  if not found then raise exception 'Student profile not found'; end if;
  select * into v_block from public.question_blocks where id = p_block_id and user_id = v_user for update;
  if not found then raise exception 'Block not found'; end if;
  if p_expected_repetitions is null or v_block.repetitions <> p_expected_repetitions then
    raise exception 'Session changed; reload the block before saving';
  end if;

  select r.id into v_last_id from public.block_reviews r
    where r.block_id = p_block_id and r.user_id = v_user
      and r.contact_type = case when v_block.repetitions = 0 then 'first_contact' else 'review' end
    order by r.review_date desc, r.created_at desc limit 1;
  if v_last_id is null or v_last_id <> p_review_id then raise exception 'Only the last session can be edited'; end if;
  select * into v_session from public.block_reviews where id = v_last_id for update;

  v_today := (now() at time zone v_profile.timezone)::date;
  if v_questions is null or v_questions < 1 or v_correct is null or v_correct < 0 or v_correct > v_questions then
    raise exception 'Invalid question counts';
  end if;
  if v_session.contact_type = 'review' then
    select max(r.review_date) into v_previous_date from public.block_reviews r
      where r.block_id = p_block_id and r.user_id = v_user and r.id <> v_session.id;
    v_previous_date := coalesce(v_previous_date, v_block.study_date);
  end if;
  if v_date is null or v_date > v_today or v_date < v_previous_date then
    raise exception 'Session date must be between the previous contact and today';
  end if;
  if v_next is null or v_interval is null or v_interval not between 7 and 180 or v_next <> v_date + v_interval then
    raise exception 'Invalid review interval';
  end if;
  v_moves := v_next is distinct from v_block.next_review_date;
  if v_moves and p_planned_review_date is not null and p_planned_review_date < v_today then
    raise exception 'Planned review date cannot be in the past';
  end if;

  -- The relevance the session used (engine_relevance) and its previous interval stay as recorded.
  update public.block_reviews set review_date = v_date, question_count = v_questions, correct_count = v_correct,
    accuracy_percentage = (p_session ->> 'accuracy_percentage')::integer,
    perceived_difficulty = p_session ->> 'perceived_difficulty',
    time_spent_minutes = (p_session ->> 'time_spent_minutes')::integer,
    sm2_grade_calculated = (p_session ->> 'sm2_grade_calculated')::integer,
    new_next_review_date = v_next, new_interval_days = v_interval,
    calculation_mode = p_session ->> 'calculation_mode', performance_band = p_session ->> 'performance_band',
    engine_version = coalesce(p_session ->> 'engine_version', engine_version)
    where id = v_session.id returning * into v_session;

  if v_moves then
    -- The next review moves to its new week; the weekly preparation decides again whether it is late.
    update public.weekly_plan_items i set due_week_start = due.week_start, original_due_week_start = due.week_start,
      week_starts_on = extract(dow from due.week_start)::integer, planned_review_date = p_planned_review_date,
      planning_source = v_source, backlog_since = null
      from (select public.planning_week_start(v_user, v_next, v_profile.week_starts_on) as week_start) due
      where i.user_id = v_user and i.block_id = p_block_id and i.revision_number = v_block.repetitions and i.status = 'open';
  end if;

  update public.question_blocks set question_count = v_session.question_count, correct_count = v_session.correct_count,
    accuracy_percentage = v_session.accuracy_percentage, perceived_difficulty = v_session.perceived_difficulty,
    time_spent_minutes = v_session.time_spent_minutes, interval_days = v_interval, next_review_date = v_next,
    last_review_date = v_date,
    study_date = case when v_session.contact_type = 'first_contact' then v_date else study_date end,
    planned_review_date = case when v_moves then p_planned_review_date else planned_review_date end,
    planning_source = case when v_moves then v_source else planning_source end,
    backlog_since = case when v_moves then null else backlog_since end,
    backlog_urgency = case when v_moves then null else backlog_urgency end,
    performance_band = v_session.performance_band, calculation_mode = coalesce(v_session.calculation_mode, calculation_mode),
    engine_version = v_session.engine_version
    where id = p_block_id and user_id = v_user returning * into v_block;

  return jsonb_build_object('block', to_jsonb(v_block), 'review', to_jsonb(v_session));
end;
$$;

revoke execute on function public.edit_last_block_session(uuid,uuid,integer,jsonb,date) from public, anon;
grant execute on function public.edit_last_block_session(uuid,uuid,integer,jsonb,date) to authenticated;
