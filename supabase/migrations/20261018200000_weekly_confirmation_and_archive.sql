-- Phase 1 of the weekly experience. Additive: no existing row changes meaning.
-- * weekly_plans.availability_confirmed_at records that the student answered the
--   start-of-week question (adjusted the week or kept the routine).
-- * question_blocks.archived_at takes a topic out of planning while keeping its
--   history; permanent deletion stays available as a separate action.

alter table public.weekly_plans add column availability_confirmed_at timestamptz;
alter table public.question_blocks add column archived_at timestamptz;
create index question_blocks_active_user_idx on public.question_blocks(user_id) where archived_at is null;

create or replace function public.save_weekly_availability(p_week_start date,p_study_days integer[],p_daily_capacities jsonb)
returns public.weekly_plans language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.student_profiles;
  v_plan public.weekly_plans;
  v_days smallint[];
  v_capacity integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_profile from public.student_profiles where user_id = v_user for update;
  if not found then raise exception 'Student profile not found'; end if;
  if p_week_start is null or p_week_start <> public.planning_week_start(v_user,p_week_start,v_profile.week_starts_on) then raise exception 'Invalid week start'; end if;
  if p_week_start + 7 <= (now() at time zone v_profile.timezone)::date then raise exception 'Closed weeks cannot be edited'; end if;
  if p_study_days is null or cardinality(p_study_days) > 7 or not (p_study_days <@ array[1,2,3,4,5,6,7]) or array_position(p_study_days,null) is not null
    or not public.valid_daily_capacities(p_daily_capacities) then raise exception 'Invalid weekly availability'; end if;
  select coalesce(array_agg(d::smallint order by d),'{}'::smallint[]) into v_days from (select distinct unnest(p_study_days) d) ds;
  select coalesce(sum(coalesce((p_daily_capacities ->> d::text)::integer,(v_profile.daily_capacities ->> d::text)::integer,v_profile.daily_theme_capacity)),0)
    into v_capacity from unnest(v_days) d;
  insert into public.weekly_plans(user_id,week_start,capacity,study_days,daily_capacities,week_starts_on,availability_confirmed_at)
    values(v_user,p_week_start,v_capacity,v_days,p_daily_capacities,extract(dow from p_week_start)::integer,now())
    on conflict(user_id,week_start) do update set capacity = excluded.capacity,study_days = excluded.study_days,
      daily_capacities = excluded.daily_capacities,availability_confirmed_at = excluded.availability_confirmed_at
    where public.weekly_plans.closed_at is null returning * into v_plan;
  if not found then raise exception 'Closed weeks cannot be edited'; end if;
  return v_plan;
end;
$$;

create or replace function public.reset_weekly_availability(p_week_start date)
returns public.weekly_plans language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.student_profiles;
  v_plan public.weekly_plans;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_profile from public.student_profiles where user_id = v_user for update;
  if not found then raise exception 'Student profile not found'; end if;
  if p_week_start is null or p_week_start <> public.planning_week_start(v_user,p_week_start,v_profile.week_starts_on) then raise exception 'Invalid week start'; end if;
  if p_week_start + 7 <= (now() at time zone v_profile.timezone)::date then raise exception 'Closed weeks cannot be edited'; end if;
  insert into public.weekly_plans(user_id,week_start,capacity,week_starts_on,availability_confirmed_at)
    values(v_user,p_week_start,v_profile.weekly_review_capacity,extract(dow from p_week_start)::integer,now())
    on conflict(user_id,week_start) do update set study_days = null,daily_capacities = null,capacity = excluded.capacity,
      availability_confirmed_at = excluded.availability_confirmed_at
    where public.weekly_plans.closed_at is null returning * into v_plan;
  if not found then raise exception 'Closed weeks cannot be edited'; end if;
  return v_plan;
end;
$$;

-- "Keep my routine": confirms the week without touching an adjustment already saved.
create or replace function public.confirm_weekly_availability(p_week_start date)
returns public.weekly_plans language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.student_profiles;
  v_plan public.weekly_plans;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_profile from public.student_profiles where user_id = v_user for update;
  if not found then raise exception 'Student profile not found'; end if;
  if p_week_start is null or p_week_start <> public.planning_week_start(v_user,p_week_start,v_profile.week_starts_on) then raise exception 'Invalid week start'; end if;
  if p_week_start + 7 <= (now() at time zone v_profile.timezone)::date then raise exception 'Closed weeks cannot be edited'; end if;
  insert into public.weekly_plans(user_id,week_start,capacity,week_starts_on,availability_confirmed_at)
    values(v_user,p_week_start,v_profile.weekly_review_capacity,extract(dow from p_week_start)::integer,now())
    on conflict(user_id,week_start) do update set availability_confirmed_at = coalesce(public.weekly_plans.availability_confirmed_at, excluded.availability_confirmed_at)
    where public.weekly_plans.closed_at is null returning * into v_plan;
  if not found then raise exception 'Closed weeks cannot be edited'; end if;
  return v_plan;
end;
$$;

-- Same as 20260918230725, except that archived topics get no occurrence, never
-- turn into backlog while archived and are left out of the returned items.
create or replace function public.prepare_weekly_plan(p_reference_date date)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.student_profiles;
  v_week date;
  v_closed integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_profile from public.student_profiles where user_id = v_user for update;
  if not found then raise exception 'Student profile not found'; end if;
  if p_reference_date is null or p_reference_date > (now() at time zone v_profile.timezone)::date then
    raise exception 'Reference date cannot be in the future';
  end if;
  -- Use the same profile -> blocks lock order as completion, avoiding races/deadlocks.
  perform 1 from public.question_blocks where user_id = v_user order by id for update;
  v_week := public.planning_week_start(v_user,p_reference_date,v_profile.week_starts_on);
  insert into public.weekly_plans(user_id,week_start,capacity,week_starts_on)
    values(v_user,v_week,v_profile.weekly_review_capacity,extract(dow from v_week)::integer) on conflict do nothing;
  insert into public.weekly_plan_items(user_id,block_id,revision_number,due_week_start,original_due_week_start,week_starts_on,planned_review_date,planning_source)
    select b.user_id,b.id,b.repetitions,due.week_start,due.week_start,extract(dow from due.week_start)::integer,b.planned_review_date,b.planning_source
    from public.question_blocks b cross join lateral (
      select public.planning_week_start(v_user,case when b.planning_source = 'manual' then coalesce(b.planned_review_date,b.next_review_date) else b.next_review_date end,v_profile.week_starts_on) as week_start
    ) due where b.user_id = v_user and b.archived_at is null on conflict(user_id,block_id,revision_number) do nothing;
  -- A missed occurrence creates one debt, even after several weeks away. Future eligible
  -- anticipations are not due in a closed week and therefore cannot become backlog.
  update public.weekly_plan_items i set backlog_since = coalesce(i.backlog_since,i.due_week_start)
    where i.user_id = v_user and i.status = 'open' and i.due_week_start + 7 <= p_reference_date and i.backlog_since is null
      and not exists (select 1 from public.question_blocks b where b.id = i.block_id and b.archived_at is not null);
  insert into public.weekly_plans(user_id,week_start,capacity,week_starts_on,closed_at)
    select distinct v_user,i.due_week_start,0,i.week_starts_on,now() from public.weekly_plan_items i
    where i.user_id = v_user and i.due_week_start + 7 <= p_reference_date on conflict do nothing;
  update public.weekly_plans set closed_at = now() where user_id = v_user and week_start + 7 <= p_reference_date and closed_at is null;
  get diagnostics v_closed = row_count;
  update public.question_blocks b set backlog_since = i.backlog_since,
    backlog_urgency = case when i.backlog_since is null then null
      when b.backlog_since = i.backlog_since and b.backlog_urgency is not null then b.backlog_urgency
      else least(9999, greatest(0,(i.backlog_since + 6 - coalesce(b.last_review_date,b.study_date))::numeric / greatest(b.interval_days,1))) end
    from public.weekly_plan_items i where b.user_id = v_user and i.user_id = v_user and i.block_id = b.id and i.revision_number = b.repetitions
    and b.archived_at is null
    and (b.backlog_since is distinct from i.backlog_since or (i.backlog_since is null and b.backlog_urgency is not null) or (i.backlog_since is not null and b.backlog_urgency is null));
  return jsonb_build_object('week_start',v_week,'week_starts_on',extract(dow from v_week)::integer,'closed_weeks',v_closed,
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.due_week_start,i.created_at) from public.weekly_plan_items i
      join public.question_blocks b on b.id = i.block_id and b.archived_at is null
      where i.user_id = v_user and i.status = 'open'),'[]'::jsonb));
end;
$$;

revoke execute on function public.confirm_weekly_availability(date) from public, anon;
grant execute on function public.confirm_weekly_availability(date) to authenticated;
