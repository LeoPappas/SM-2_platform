-- A student studies a topic once and then only reviews it, so an active topic
-- cannot be registered twice: the same course lesson, the same Lista MetaMed
-- topic or, for own topics, the same name. The form already checks this; these
-- indexes keep a double click or an older client from creating a copy. Archived
-- topics do not count, and restoring one fails while an active copy exists.

create unique index question_blocks_one_active_catalog_item
  on public.question_blocks(user_id, catalog_item_id)
  where catalog_item_id is not null and archived_at is null;

create unique index question_blocks_one_active_canonical_topic
  on public.question_blocks(user_id, canonical_topic_id)
  where canonical_topic_id is not null and archived_at is null;

create unique index question_blocks_one_active_own_title
  on public.question_blocks(user_id, lower(title))
  where catalog_item_id is null and canonical_topic_id is null and archived_at is null;
