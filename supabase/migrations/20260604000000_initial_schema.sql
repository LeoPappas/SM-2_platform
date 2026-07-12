create table if not exists public.themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  area text not null,
  repetitions integer not null default 0,
  easiness_factor numeric(4, 2) not null default 2.50,
  interval_days integer not null default 1,
  next_review_date date not null default current_date,
  calendar_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.themes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null,
  accuracy_percentage integer not null check (accuracy_percentage between 0 and 100),
  easiness_rating text not null check (
    easiness_rating in ('Muito Fácil', 'Fácil', 'Médio', 'Difícil', 'Muito Difícil')
  ),
  sm2_grade_calculated integer not null check (sm2_grade_calculated between 0 and 5),
  created_at timestamptz not null default now()
);

create index if not exists themes_user_next_review_idx
  on public.themes (user_id, next_review_date);

create index if not exists study_sessions_user_study_date_idx
  on public.study_sessions (user_id, study_date);

create index if not exists study_sessions_theme_created_at_idx
  on public.study_sessions (theme_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists themes_set_updated_at on public.themes;
create trigger themes_set_updated_at
  before update on public.themes
  for each row
  execute function public.set_updated_at();

alter table public.themes enable row level security;
alter table public.study_sessions enable row level security;

drop policy if exists "Users can read own themes" on public.themes;
create policy "Users can read own themes"
  on public.themes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own themes" on public.themes;
create policy "Users can insert own themes"
  on public.themes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own themes" on public.themes;
create policy "Users can update own themes"
  on public.themes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own themes" on public.themes;
create policy "Users can delete own themes"
  on public.themes for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own study sessions" on public.study_sessions;
create policy "Users can read own study sessions"
  on public.study_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own study sessions" on public.study_sessions;
create policy "Users can insert own study sessions"
  on public.study_sessions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.themes
      where themes.id = study_sessions.theme_id
        and themes.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own study sessions" on public.study_sessions;
create policy "Users can update own study sessions"
  on public.study_sessions for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.themes
      where themes.id = study_sessions.theme_id
        and themes.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete own study sessions" on public.study_sessions;
create policy "Users can delete own study sessions"
  on public.study_sessions for delete
  using (auth.uid() = user_id);
