create table if not exists public.student_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  exam_date date,
  preparation_start_date date not null default current_date,
  preparation_horizon_months integer not null default 12
    check (preparation_horizon_months between 1 and 36),
  weekly_review_capacity integer not null default 4
    check (weekly_review_capacity between 1 and 50),
  course_theme_total integer
    check (course_theme_total is null or course_theme_total > 0),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_student_profiles_updated_at on public.student_profiles;
create trigger set_student_profiles_updated_at
  before update on public.student_profiles
  for each row
  execute function public.set_updated_at();

alter table public.student_profiles enable row level security;

drop policy if exists "Users can select their student profile" on public.student_profiles;
create policy "Users can select their student profile"
  on public.student_profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their student profile" on public.student_profiles;
create policy "Users can insert their student profile"
  on public.student_profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their student profile" on public.student_profiles;
create policy "Users can update their student profile"
  on public.student_profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their student profile" on public.student_profiles;
create policy "Users can delete their student profile"
  on public.student_profiles for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.student_profiles to authenticated;

create table if not exists public.weekly_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  capacity integer not null check (capacity between 0 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

drop trigger if exists set_weekly_plans_updated_at on public.weekly_plans;
create trigger set_weekly_plans_updated_at
  before update on public.weekly_plans
  for each row
  execute function public.set_updated_at();

alter table public.weekly_plans enable row level security;

drop policy if exists "Users can select their weekly plans" on public.weekly_plans;
create policy "Users can select their weekly plans"
  on public.weekly_plans for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their weekly plans" on public.weekly_plans;
create policy "Users can insert their weekly plans"
  on public.weekly_plans for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their weekly plans" on public.weekly_plans;
create policy "Users can update their weekly plans"
  on public.weekly_plans for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their weekly plans" on public.weekly_plans;
create policy "Users can delete their weekly plans"
  on public.weekly_plans for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.weekly_plans to authenticated;

alter table public.question_blocks
  add column if not exists major_area text not null default 'A classificar',
  add column if not exists specialty text not null default 'A classificar',
  add column if not exists importance text not null default 'media',
  add column if not exists suggested_importance text,
  add column if not exists last_review_date date,
  add column if not exists planned_review_date date,
  add column if not exists backlog_since date,
  add column if not exists backlog_urgency numeric(8, 4),
  add column if not exists pre_exam_review_requested boolean not null default false,
  add column if not exists performance_band text,
  add column if not exists calculation_mode text not null default 'performance',
  add column if not exists engine_version text not null default 'metamed-v1';

update public.question_blocks
set
  major_area = case
    when lower(area_name) like '%cirurg%' then 'Cirurgia'
    when lower(area_name) like '%pediatr%' then 'Pediatria'
    when lower(area_name) like '%prevent%' then 'Preventiva'
    when lower(area_name) like '%gine%'
      or lower(area_name) like '%obst%'
      or lower(trim(area_name)) in ('go', 'g.o.', 'geo')
      then 'Ginecologia e Obstetrícia'
    when lower(area_name) like '%clínic%'
      or lower(area_name) like '%clinic%'
      then 'Clínica Médica'
    else 'A classificar'
  end,
  specialty = coalesce(nullif(trim(area_name), ''), 'A classificar'),
  importance = case
    when priority_weight >= 4 then 'alta'
    when priority_weight <= 2 then 'baixa'
    else 'media'
  end,
  last_review_date = coalesce(
    (
      select max(block_reviews.review_date)
      from public.block_reviews
      where block_reviews.block_id = question_blocks.id
    ),
    study_date
  ),
  performance_band = case
    when accuracy_percentage >= 85 then 'muito_bom'
    when accuracy_percentage >= 70 then 'bom'
    when accuracy_percentage >= 50 then 'ruim'
    else 'muito_ruim'
  end,
  calculation_mode = case
    when question_count < 20 then 'small_sample'
    else 'performance'
  end,
  engine_version = 'sm2-legacy'
where engine_version = 'metamed-v1'
  and last_review_date is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'question_blocks_major_area_check'
      and conrelid = 'public.question_blocks'::regclass
  ) then
    alter table public.question_blocks
      add constraint question_blocks_major_area_check
      check (major_area in (
        'Clínica Médica',
        'Cirurgia',
        'Ginecologia e Obstetrícia',
        'Pediatria',
        'Preventiva',
        'A classificar'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'question_blocks_importance_check'
      and conrelid = 'public.question_blocks'::regclass
  ) then
    alter table public.question_blocks
      add constraint question_blocks_importance_check
      check (importance in ('alta', 'media', 'baixa'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'question_blocks_suggested_importance_check'
      and conrelid = 'public.question_blocks'::regclass
  ) then
    alter table public.question_blocks
      add constraint question_blocks_suggested_importance_check
      check (
        suggested_importance is null
        or suggested_importance in ('alta', 'media', 'baixa')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'question_blocks_backlog_urgency_check'
      and conrelid = 'public.question_blocks'::regclass
  ) then
    alter table public.question_blocks
      add constraint question_blocks_backlog_urgency_check
      check (backlog_urgency is null or backlog_urgency >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'question_blocks_performance_band_check'
      and conrelid = 'public.question_blocks'::regclass
  ) then
    alter table public.question_blocks
      add constraint question_blocks_performance_band_check
      check (
        performance_band is null
        or performance_band in ('muito_bom', 'bom', 'ruim', 'muito_ruim')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'question_blocks_calculation_mode_check'
      and conrelid = 'public.question_blocks'::regclass
  ) then
    alter table public.question_blocks
      add constraint question_blocks_calculation_mode_check
      check (calculation_mode in ('performance', 'small_sample'));
  end if;
end $$;

create index if not exists question_blocks_user_major_area_idx
  on public.question_blocks (user_id, major_area);

create index if not exists question_blocks_user_planned_review_idx
  on public.question_blocks (user_id, planned_review_date)
  where planned_review_date is not null;

create index if not exists question_blocks_user_backlog_idx
  on public.question_blocks (user_id, backlog_since)
  where backlog_since is not null;

alter table public.block_reviews
  add column if not exists contact_type text not null default 'review',
  add column if not exists engine_version text not null default 'sm2-legacy',
  add column if not exists calculation_mode text,
  add column if not exists performance_band text,
  add column if not exists importance text,
  add column if not exists previous_interval_days integer,
  add column if not exists new_interval_days integer,
  add column if not exists priority_score numeric(10, 4);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'block_reviews_contact_type_check'
      and conrelid = 'public.block_reviews'::regclass
  ) then
    alter table public.block_reviews
      add constraint block_reviews_contact_type_check
      check (contact_type in ('first_contact', 'review'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'block_reviews_calculation_mode_check'
      and conrelid = 'public.block_reviews'::regclass
  ) then
    alter table public.block_reviews
      add constraint block_reviews_calculation_mode_check
      check (
        calculation_mode is null
        or calculation_mode in ('performance', 'small_sample')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'block_reviews_performance_band_check'
      and conrelid = 'public.block_reviews'::regclass
  ) then
    alter table public.block_reviews
      add constraint block_reviews_performance_band_check
      check (
        performance_band is null
        or performance_band in ('muito_bom', 'bom', 'ruim', 'muito_ruim')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'block_reviews_importance_check'
      and conrelid = 'public.block_reviews'::regclass
  ) then
    alter table public.block_reviews
      add constraint block_reviews_importance_check
      check (importance is null or importance in ('alta', 'media', 'baixa'));
  end if;
end $$;

create index if not exists block_reviews_user_engine_idx
  on public.block_reviews (user_id, engine_version, review_date desc);

create index if not exists block_reviews_block_contact_idx
  on public.block_reviews (block_id, contact_type, review_date desc);
