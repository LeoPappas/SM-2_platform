drop table if exists public.block_reviews cascade;
drop table if exists public.question_blocks cascade;
drop table if exists public.exam_targets cascade;
drop table if exists public.areas cascade;
drop table if exists public.study_sessions cascade;
drop table if exists public.themes cascade;

create table public.exam_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  exam_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.question_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  area_id uuid references public.areas(id) on delete set null,
  area_name text not null,
  exam_target_id uuid references public.exam_targets(id) on delete set null,
  source text,
  question_count integer not null check (question_count > 0),
  correct_count integer not null check (correct_count >= 0 and correct_count <= question_count),
  accuracy_percentage integer not null check (accuracy_percentage between 0 and 100),
  perceived_difficulty text not null check (perceived_difficulty in ('Muito fácil', 'Fácil', 'Médio', 'Difícil', 'Muito difícil')),
  time_spent_minutes integer check (time_spent_minutes is null or time_spent_minutes >= 0),
  priority_weight integer not null default 3 check (priority_weight between 1 and 5),
  study_date date not null default current_date,
  repetitions integer not null default 0,
  easiness_factor numeric(4, 2) not null default 2.50,
  interval_days integer not null default 1,
  next_review_date date not null default current_date,
  calendar_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.block_reviews (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.question_blocks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  review_date date not null default current_date,
  question_count integer not null check (question_count > 0),
  correct_count integer not null check (correct_count >= 0 and correct_count <= question_count),
  accuracy_percentage integer not null check (accuracy_percentage between 0 and 100),
  perceived_difficulty text not null check (perceived_difficulty in ('Muito fácil', 'Fácil', 'Médio', 'Difícil', 'Muito difícil')),
  time_spent_minutes integer check (time_spent_minutes is null or time_spent_minutes >= 0),
  sm2_grade_calculated integer not null check (sm2_grade_calculated between 0 and 5),
  previous_next_review_date date,
  new_next_review_date date not null,
  created_at timestamptz not null default now()
);

create index exam_targets_user_exam_date_idx on public.exam_targets (user_id, exam_date);
create index areas_user_name_idx on public.areas (user_id, name);
create index question_blocks_user_next_review_idx on public.question_blocks (user_id, next_review_date);
create index question_blocks_user_area_idx on public.question_blocks (user_id, area_name);
create index question_blocks_user_exam_target_idx on public.question_blocks (user_id, exam_target_id);
create index block_reviews_user_review_date_idx on public.block_reviews (user_id, review_date);
create index block_reviews_block_created_idx on public.block_reviews (block_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_exam_targets_updated_at
  before update on public.exam_targets
  for each row
  execute function public.set_updated_at();

create trigger set_areas_updated_at
  before update on public.areas
  for each row
  execute function public.set_updated_at();

create trigger set_question_blocks_updated_at
  before update on public.question_blocks
  for each row
  execute function public.set_updated_at();

alter table public.exam_targets enable row level security;
alter table public.areas enable row level security;
alter table public.question_blocks enable row level security;
alter table public.block_reviews enable row level security;

create policy "Users can select their exam targets"
  on public.exam_targets for select
  using (auth.uid() = user_id);

create policy "Users can insert their exam targets"
  on public.exam_targets for insert
  with check (auth.uid() = user_id);

create policy "Users can update their exam targets"
  on public.exam_targets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their exam targets"
  on public.exam_targets for delete
  using (auth.uid() = user_id);

create policy "Users can select their areas"
  on public.areas for select
  using (auth.uid() = user_id);

create policy "Users can insert their areas"
  on public.areas for insert
  with check (auth.uid() = user_id);

create policy "Users can update their areas"
  on public.areas for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their areas"
  on public.areas for delete
  using (auth.uid() = user_id);

create policy "Users can select their question blocks"
  on public.question_blocks for select
  using (auth.uid() = user_id);

create policy "Users can insert their question blocks"
  on public.question_blocks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their question blocks"
  on public.question_blocks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their question blocks"
  on public.question_blocks for delete
  using (auth.uid() = user_id);

create policy "Users can select their block reviews"
  on public.block_reviews for select
  using (auth.uid() = user_id);

create policy "Users can insert their block reviews"
  on public.block_reviews for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.question_blocks
      where question_blocks.id = block_reviews.block_id
        and question_blocks.user_id = auth.uid()
    )
  );

create policy "Users can update their block reviews"
  on public.block_reviews for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.question_blocks
      where question_blocks.id = block_reviews.block_id
        and question_blocks.user_id = auth.uid()
    )
  );

create policy "Users can delete their block reviews"
  on public.block_reviews for delete
  using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.exam_targets to authenticated;
grant select, insert, update, delete on public.areas to authenticated;
grant select, insert, update, delete on public.question_blocks to authenticated;
grant select, insert, update, delete on public.block_reviews to authenticated;
