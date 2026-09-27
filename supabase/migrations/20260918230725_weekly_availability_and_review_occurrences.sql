-- Additive: existing blocks, contacts and completed reviews remain unchanged.
create or replace function public.valid_daily_capacities(p_values jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select p_values is null or (
    jsonb_typeof(p_values) = 'object'
    and not exists (
      select 1 from jsonb_each(case when jsonb_typeof(p_values) = 'object' then p_values else '{}'::jsonb end) v
      where v.key !~ '^[1-7]$' or jsonb_typeof(v.value) <> 'number' or v.value::text !~ '^(0|[1-9]|1[0-9]|20)$'
    )
  );
$$;

alter table public.student_profiles
  add column week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  add column timezone text not null default 'America/Sao_Paulo',
  add column daily_capacities jsonb check (public.valid_daily_capacities(daily_capacities));

alter table public.weekly_plans
  add column study_days smallint[] check (study_days is null or (cardinality(study_days) <= 7 and study_days <@ array[1,2,3,4,5,6,7]::smallint[])),
  add column daily_capacities jsonb check (public.valid_daily_capacities(daily_capacities)),
  add column week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  add column closed_at timestamptz;
update public.weekly_plans set week_starts_on = extract(dow from week_start)::smallint;

-- Profile changes no longer overwrite the capacity of individual saved weeks.
create or replace function public.sync_student_weekly_capacity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid planning timezone';
  end if;
  if not public.valid_daily_capacities(new.daily_capacities) then
    raise exception 'Invalid daily capacities';
  end if;
  select coalesce(sum(coalesce((new.daily_capacities ->> d::text)::integer, new.daily_theme_capacity)), 0)
    into new.weekly_review_capacity from (select distinct unnest(new.study_days) as d) days;
  return new;
end;
$$;
alter table public.student_profiles drop constraint student_profiles_weekly_review_capacity_check;
alter table public.student_profiles add constraint student_profiles_weekly_review_capacity_check check (weekly_review_capacity between 0 and 140);

alter table public.question_blocks add constraint question_blocks_user_id_id_key unique (user_id, id);
alter table public.block_reviews add column operation_id uuid;
create unique index block_reviews_user_operation_idx on public.block_reviews(user_id, operation_id) where operation_id is not null;

create table public.weekly_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  block_id uuid not null,
  revision_number integer not null check (revision_number >= 0),
  due_week_start date not null,
  original_due_week_start date not null,
  week_starts_on smallint not null check (week_starts_on between 0 and 6),
  planned_review_date date,
  planning_source text check (planning_source in ('manual','automatic')),
  status text not null default 'open' check (status in ('open','completed')),
  backlog_since date,
  completed_at timestamptz,
  completed_review_id uuid references public.block_reviews(id) on delete set null,
  reschedule_history jsonb not null default '[]'::jsonb check (jsonb_typeof(reschedule_history) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, block_id, revision_number),
  foreign key (user_id, block_id) references public.question_blocks(user_id,id) on delete cascade
);
create index weekly_plan_items_user_due_idx on public.weekly_plan_items(user_id,status,due_week_start);
create index weekly_plan_items_block_idx on public.weekly_plan_items(block_id);
create index weekly_plan_items_review_idx on public.weekly_plan_items(completed_review_id);
create trigger set_weekly_plan_items_updated_at before update on public.weekly_plan_items for each row execute function public.set_updated_at();
alter table public.weekly_plan_items enable row level security;
create policy "Users can read their review occurrences" on public.weekly_plan_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their review occurrences" on public.weekly_plan_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their review occurrences" on public.weekly_plan_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.weekly_plan_items to authenticated;

-- Preserve the anchor of a previously saved week when a profile preference changes.
create or replace function public.planning_week_start(p_user_id uuid, p_date date, p_start integer)
returns date language sql stable security invoker set search_path = '' as $$
  select coalesce(
    (select w.week_start from public.weekly_plans w where w.user_id = p_user_id
      and p_date between w.week_start and w.week_start + 6 order by w.week_start desc limit 1),
    p_date - ((extract(dow from p_date)::integer - p_start + 7) % 7)
  );
$$;

create or replace function public.sync_review_occurrence()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_profile public.student_profiles;
  v_item public.weekly_plan_items;
  v_due date;
  v_today date;
  v_backlog date;
  v_reanchor boolean := false;
begin
  select * into v_profile from public.student_profiles where user_id = new.user_id;
  if not found then return new; end if;
  v_today := (now() at time zone v_profile.timezone)::date;
  -- Create the previous occurrence first so a late manual move cannot erase its debt.
  if tg_op = 'UPDATE' then
    v_due := public.planning_week_start(old.user_id,
      case when old.planning_source = 'manual' then coalesce(old.planned_review_date, old.next_review_date) else old.next_review_date end,
      v_profile.week_starts_on);
    insert into public.weekly_plan_items(user_id,block_id,revision_number,due_week_start,original_due_week_start,week_starts_on,planned_review_date,planning_source)
      values(old.user_id,old.id,old.repetitions,v_due,v_due,extract(dow from v_due)::integer,old.planned_review_date,old.planning_source)
      on conflict(user_id,block_id,revision_number) do nothing;
  end if;
  v_due := public.planning_week_start(new.user_id,
    case when new.planning_source = 'manual' then coalesce(new.planned_review_date,new.next_review_date) else new.next_review_date end,
    v_profile.week_starts_on);
  insert into public.weekly_plan_items(user_id,block_id,revision_number,due_week_start,original_due_week_start,week_starts_on,planned_review_date,planning_source)
    values(new.user_id,new.id,new.repetitions,v_due,v_due,extract(dow from v_due)::integer,new.planned_review_date,new.planning_source)
    on conflict(user_id,block_id,revision_number) do nothing;
  select * into v_item from public.weekly_plan_items where user_id = new.user_id and block_id = new.id and revision_number = new.repetitions for update;
  if v_item.status = 'completed' then return new; end if;
  v_backlog := v_item.backlog_since;
  if v_item.due_week_start + 7 <= v_today then v_backlog := coalesce(v_backlog,v_item.due_week_start); end if;
  v_reanchor := v_backlog is null and (new.planning_source = 'manual' or (tg_op = 'UPDATE' and old.planning_source = 'manual' and new.planning_source = 'automatic'));
  if v_reanchor and v_due + 7 <= v_today then v_backlog := coalesce(v_backlog,v_due); end if;
  update public.weekly_plan_items set
    backlog_since = v_backlog,
    due_week_start = case when v_reanchor then v_due else due_week_start end,
    week_starts_on = case when v_reanchor then extract(dow from v_due)::integer else week_starts_on end,
    planned_review_date = new.planned_review_date,
    planning_source = new.planning_source,
    reschedule_history = case when tg_op = 'UPDATE' and new.planned_review_date is distinct from v_item.planned_review_date
      then reschedule_history || jsonb_build_array(jsonb_build_object('at',now(),'from',v_item.planned_review_date,'to',new.planned_review_date,'source',new.planning_source)) else reschedule_history end
    where id = v_item.id;
  -- AFTER trigger updates only the legacy debt fields, without invoking itself again.
  if new.backlog_since is distinct from v_backlog then
    update public.question_blocks set backlog_since = v_backlog,
      backlog_urgency = case when v_backlog is null then null else
        least(9999, greatest(0,(v_backlog + 6 - coalesce(new.last_review_date,new.study_date))::numeric / greatest(new.interval_days,1))) end
      where id = new.id and user_id = new.user_id;
  end if;
  return new;
end;
$$;
create trigger sync_review_occurrence after insert or update of next_review_date,planned_review_date,planning_source,repetitions
  on public.question_blocks for each row execute function public.sync_review_occurrence();

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
    ) due where b.user_id = v_user on conflict(user_id,block_id,revision_number) do nothing;
  -- A missed occurrence creates one debt, even after several weeks away. Future eligible
  -- anticipations are not due in a closed week and therefore cannot become backlog.
  update public.weekly_plan_items set backlog_since = coalesce(backlog_since,due_week_start)
    where user_id = v_user and status = 'open' and due_week_start + 7 <= p_reference_date and backlog_since is null;
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
    and (b.backlog_since is distinct from i.backlog_since or (i.backlog_since is null and b.backlog_urgency is not null) or (i.backlog_since is not null and b.backlog_urgency is null));
  return jsonb_build_object('week_start',v_week,'week_starts_on',extract(dow from v_week)::integer,'closed_weeks',v_closed,
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.due_week_start,i.created_at) from public.weekly_plan_items i where i.user_id = v_user and i.status = 'open'),'[]'::jsonb));
end;
$$;

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
  insert into public.weekly_plans(user_id,week_start,capacity,study_days,daily_capacities,week_starts_on)
    values(v_user,p_week_start,v_capacity,v_days,p_daily_capacities,extract(dow from p_week_start)::integer)
    on conflict(user_id,week_start) do update set capacity = excluded.capacity,study_days = excluded.study_days,daily_capacities = excluded.daily_capacities
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
  insert into public.weekly_plans(user_id,week_start,capacity,week_starts_on)
    values(v_user,p_week_start,v_profile.weekly_review_capacity,extract(dow from p_week_start)::integer)
    on conflict(user_id,week_start) do update set study_days = null,daily_capacities = null,capacity = excluded.capacity
    where public.weekly_plans.closed_at is null returning * into v_plan;
  if not found then raise exception 'Closed weeks cannot be edited'; end if;
  return v_plan;
end;
$$;

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

revoke execute on function public.valid_daily_capacities(jsonb),public.planning_week_start(uuid,date,integer),public.sync_review_occurrence(),
  public.prepare_weekly_plan(date),public.save_weekly_availability(date,integer[],jsonb),public.reset_weekly_availability(date),public.complete_block_review(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.valid_daily_capacities(jsonb),public.planning_week_start(uuid,date,integer),public.sync_review_occurrence(),
  public.prepare_weekly_plan(date),public.save_weekly_availability(date,integer[],jsonb),public.reset_weekly_availability(date),public.complete_block_review(uuid,uuid,jsonb,jsonb) to authenticated;
