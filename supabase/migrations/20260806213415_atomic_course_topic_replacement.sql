create or replace function public.replace_course_topics(
  p_filename text,
  p_topics jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_topics) <> 'array' then
    raise exception 'Topics must be a JSON array';
  end if;

  delete from public.course_topics
  where user_id = (select auth.uid());

  insert into public.course_topics (
    user_id,
    source,
    source_filename,
    source_order,
    original_area,
    major_area,
    specialty,
    title
  )
  select
    (select auth.uid()),
    'upload',
    nullif(trim(p_filename), ''),
    coalesce((topic.value ->> 'sourceOrder')::integer, topic.ordinality::integer),
    nullif(trim(topic.value ->> 'originalArea'), ''),
    topic.value ->> 'majorArea',
    topic.value ->> 'specialty',
    topic.value ->> 'title'
  from jsonb_array_elements(p_topics) with ordinality as topic(value, ordinality);

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.replace_course_topics(text, jsonb) from public;
grant execute on function public.replace_course_topics(text, jsonb) to authenticated;
