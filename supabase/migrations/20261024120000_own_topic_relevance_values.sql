-- Topics without a score (own topics, or catalogs without relevance) now use the
-- median score of their category's band in the course catalogs instead of the
-- ends of the scale: alta 8.5, media 6.2, baixa 3. The old numbers (10, 5.5, 1)
-- put an own "baixa" topic below every lesson and an own "alta" at the very top.
-- Existing reviews keep the number they were calculated with.

alter table public.question_blocks drop constraint question_blocks_engine_relevance_source_check;

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
    new.engine_relevance := case new.importance when 'alta' then 8.5 when 'baixa' then 3 else 6.2 end;
  end if;
  return new;
end;
$$;
revoke execute on function public.derive_question_block_engine_relevance() from public, anon, authenticated;

-- The trigger derives the new number for every topic that only has a category.
update public.question_blocks set engine_relevance = engine_relevance
  where relevance_score is null and canonical_topic_id is null;

alter table public.question_blocks
  add constraint question_blocks_engine_relevance_source_check check (
    (relevance_score is not null and engine_relevance = relevance_score)
    or (relevance_score is null and canonical_topic_id is not null)
    or (relevance_score is null and canonical_topic_id is null and engine_relevance =
      case importance when 'alta' then 8.5 when 'baixa' then 3 else 6.2 end)
  );
