-- The scheduling engine now uses a 1-10 relevance number; students only see the
-- derived category (>= 7.5 alta, <= 3.5 baixa, otherwise media).
-- * question_blocks.engine_relevance is the number the engine uses. It is the
--   course lesson's score, the canonical topic's relevancia_global (Lista
--   MetaMed) or, for topics without a score, the number equivalent to their
--   category (alta 10, media 5.5, baixa 1), which reproduces the old factors.
-- * question_blocks.canonical_topic_id identifies a Lista MetaMed topic.
-- * block_reviews.engine_relevance records the number each review used.
-- The database derives engine_relevance on every write, so clients that do not
-- send it (the release before this one) keep working and cannot store a wrong one.

alter table public.question_blocks
  add column canonical_topic_id text references public.canonical_topics(topic_id) on delete restrict,
  add column engine_relevance numeric(3,1) not null default 5.5 check (engine_relevance between 1 and 10);

update public.question_blocks set engine_relevance = case
  when relevance_score is not null then relevance_score
  when importance = 'alta' then 10
  when importance = 'baixa' then 1
  else 5.5 end;

alter table public.question_blocks
  add constraint question_blocks_single_catalog_source_check
    check (catalog_item_id is null or canonical_topic_id is null),
  add constraint question_blocks_engine_relevance_source_check check (
    (relevance_score is not null and engine_relevance = relevance_score)
    or (relevance_score is null and canonical_topic_id is not null)
    or (relevance_score is null and canonical_topic_id is null and engine_relevance =
      case importance when 'alta' then 10 when 'baixa' then 1 else 5.5 end)
  );
create index question_blocks_canonical_topic_idx on public.question_blocks(canonical_topic_id) where canonical_topic_id is not null;

-- Lesson score, else the Lista MetaMed topic's GLOBAL score, else the category's number.
create or replace function public.derive_question_block_engine_relevance()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_score numeric(3,1);
begin
  if new.relevance_score is not null then
    new.engine_relevance := new.relevance_score;
  elsif new.canonical_topic_id is not null then
    select s.score into v_score from public.topic_relevance_scores s
    join public.course_catalog_releases r on r.publication_id = s.publication_id and r.status = 'active'
    where s.topic_id = new.canonical_topic_id and s.exam_code = 'GLOBAL'
    order by s.reference_year desc limit 1;
    if v_score is null then raise exception 'Canonical topic has no published relevance'; end if;
    new.engine_relevance := v_score;
  else
    new.engine_relevance := case new.importance when 'alta' then 10 when 'baixa' then 1 else 5.5 end;
  end if;
  return new;
end;
$$;
create trigger derive_question_block_engine_relevance
  before insert or update of relevance_score, canonical_topic_id, importance, engine_relevance on public.question_blocks
  for each row execute function public.derive_question_block_engine_relevance();

alter table public.block_reviews
  add column engine_relevance numeric(3,1) check (engine_relevance is null or engine_relevance between 1 and 10);
update public.block_reviews r set engine_relevance = b.engine_relevance
  from public.question_blocks b where b.id = r.block_id and b.user_id = r.user_id;

-- Each new review keeps the number its interval was calculated with.
create or replace function public.snapshot_block_review_engine_relevance()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select b.engine_relevance into new.engine_relevance
    from public.question_blocks b where b.id = new.block_id and b.user_id = new.user_id;
  elsif new.engine_relevance is distinct from old.engine_relevance then
    raise exception 'Historical engine relevance is immutable';
  end if;
  return new;
end;
$$;
create trigger snapshot_block_review_engine_relevance
  before insert or update of engine_relevance on public.block_reviews
  for each row execute function public.snapshot_block_review_engine_relevance();

-- Students read the published topics and GLOBAL scores of active catalogs.
create policy "Authenticated users can read topic versions of active publications"
  on public.canonical_topic_versions for select to authenticated
  using (exists (select 1 from public.course_catalog_releases r
    where r.publication_id = canonical_topic_versions.publication_id and r.status = 'active'));
create policy "Authenticated users can read aliases of active publications"
  on public.canonical_topic_aliases for select to authenticated
  using (exists (select 1 from public.course_catalog_releases r
    where r.publication_id = canonical_topic_aliases.publication_id and r.status = 'active'));
create policy "Authenticated users can read GLOBAL scores of active publications"
  on public.topic_relevance_scores for select to authenticated
  using (exam_code = 'GLOBAL' and exists (select 1 from public.course_catalog_releases r
    where r.publication_id = topic_relevance_scores.publication_id and r.status = 'active'));

revoke execute on function public.derive_question_block_engine_relevance(),
  public.snapshot_block_review_engine_relevance() from public, anon, authenticated;
