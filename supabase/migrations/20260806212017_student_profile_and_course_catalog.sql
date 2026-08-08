alter table public.student_profiles
  add column if not exists preferred_name text,
  add column if not exists study_days smallint[] not null default array[1, 2, 3, 4]::smallint[],
  add column if not exists daily_theme_capacity integer not null default 1,
  add column if not exists course_catalog_source text not null default 'metamed',
  add column if not exists course_catalog_filename text,
  add column if not exists birth_date date,
  add column if not exists exam_interests text[] not null default '{}'::text[],
  add column if not exists city text,
  add column if not exists study_experience_years numeric(4, 1),
  add column if not exists phone_number text;

alter table public.student_profiles
  drop constraint if exists student_profiles_weekly_review_capacity_check;

alter table public.student_profiles
  add constraint student_profiles_study_days_check
    check (
      cardinality(study_days) between 1 and 7
      and study_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    ),
  add constraint student_profiles_daily_theme_capacity_check
    check (daily_theme_capacity between 1 and 20),
  add constraint student_profiles_weekly_review_capacity_check
    check (weekly_review_capacity between 1 and 140),
  add constraint student_profiles_course_catalog_source_check
    check (course_catalog_source in ('metamed', 'upload')),
  add constraint student_profiles_study_experience_years_check
    check (
      study_experience_years is null
      or study_experience_years between 0 and 80
    );

update public.student_profiles
set
  study_days = case
    when weekly_review_capacity <= 7
      then (select array_agg(day::smallint) from generate_series(1, weekly_review_capacity) as day)
    else array[1]::smallint[]
  end,
  daily_theme_capacity = case
    when weekly_review_capacity <= 7 then 1
    else least(20, weekly_review_capacity)
  end;

create or replace function public.sync_student_weekly_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  unique_day_count integer;
begin
  select count(distinct day)
  into unique_day_count
  from unnest(new.study_days) as day;

  if unique_day_count < 1 then
    raise exception 'At least one study day is required';
  end if;

  new.weekly_review_capacity := new.daily_theme_capacity * unique_day_count;

  update public.weekly_plans
  set capacity = new.weekly_review_capacity
  where user_id = new.user_id
    and week_start >= date_trunc('week', current_date)::date;

  return new;
end;
$$;

drop trigger if exists sync_student_weekly_capacity on public.student_profiles;
create trigger sync_student_weekly_capacity
  before insert or update
  on public.student_profiles
  for each row
  execute function public.sync_student_weekly_capacity();

update public.student_profiles
set weekly_review_capacity = weekly_review_capacity;

alter table public.weekly_plans
  drop constraint if exists weekly_plans_capacity_check;

alter table public.weekly_plans
  add constraint weekly_plans_capacity_check
    check (capacity between 0 and 140);

create table if not exists public.course_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'upload'
    check (source = 'upload'),
  source_filename text,
  source_order integer not null default 0
    check (source_order >= 0),
  original_area text,
  major_area text not null default 'A classificar'
    check (
      major_area in (
        'Clínica Médica',
        'Cirurgia',
        'Ginecologia e Obstetrícia',
        'Pediatria',
        'Preventiva',
        'A classificar'
      )
    ),
  specialty text not null default 'A classificar',
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, title, specialty)
);

drop trigger if exists set_course_topics_updated_at on public.course_topics;
create trigger set_course_topics_updated_at
  before update on public.course_topics
  for each row
  execute function public.set_updated_at();

create index if not exists course_topics_user_search_idx
  on public.course_topics (user_id, major_area, specialty, source_order);

alter table public.course_topics enable row level security;

create policy "Users can select their course topics"
  on public.course_topics for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their course topics"
  on public.course_topics for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their course topics"
  on public.course_topics for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their course topics"
  on public.course_topics for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.course_topics to authenticated;
