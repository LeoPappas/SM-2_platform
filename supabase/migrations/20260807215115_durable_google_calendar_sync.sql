alter table public.question_blocks
  add column if not exists calendar_sync_fingerprint text;

update public.question_blocks
set calendar_sync_status = 'pending'
where calendar_sync_enabled = true;

create index if not exists question_blocks_calendar_reconciliation_idx
  on public.question_blocks (user_id, calendar_sync_status)
  where calendar_sync_enabled = true
    or calendar_event_id is not null;
