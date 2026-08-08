alter table public.question_blocks
  add column if not exists planning_source text;

update public.question_blocks
set planning_source = 'manual'
where planned_review_date is not null
  and planning_source is null;

alter table public.question_blocks
  drop constraint if exists question_blocks_planning_source_check;

alter table public.question_blocks
  add constraint question_blocks_planning_source_check
    check (planning_source is null or planning_source in ('automatic', 'manual'));

create index if not exists question_blocks_user_planning_source_idx
  on public.question_blocks (user_id, planning_source, planned_review_date)
  where planned_review_date is not null;
