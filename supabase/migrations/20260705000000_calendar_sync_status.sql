alter table public.question_blocks
  add column if not exists calendar_sync_enabled boolean not null default true,
  add column if not exists calendar_sync_status text not null default 'pending',
  add column if not exists calendar_last_error text,
  add column if not exists calendar_last_synced_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'question_blocks_calendar_sync_status_check'
      and conrelid = 'public.question_blocks'::regclass
  ) then
    alter table public.question_blocks
      add constraint question_blocks_calendar_sync_status_check
      check (calendar_sync_status in ('pending', 'synced', 'failed', 'disabled'));
  end if;
end $$;

update public.question_blocks
set calendar_sync_status = 'synced'
where calendar_event_id is not null
  and calendar_sync_status = 'pending';

create index if not exists question_blocks_user_calendar_sync_status_idx
  on public.question_blocks (user_id, calendar_sync_status);
