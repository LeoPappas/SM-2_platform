-- Activates the Medway, MedGrupo (Medcurso) and MedCof catalogs from relevance v3
-- and lets each student choose one of them. The numeric engine stays inactive:
-- relevance only reaches the schedule through the categorical importance that
-- get_catalog_suggestions derives from the item score.

update public.course_catalog_releases
set status = 'active'
where publication_id = '686f62f2-a38c-59f1-99f3-55d17ef7b4ac'
  and status = 'validated';

do $$
begin
  if (select count(*) from public.course_catalog_releases
      where publication_id = '686f62f2-a38c-59f1-99f3-55d17ef7b4ac' and status = 'active') <> 3 then
    raise exception 'Expected the three v3 course catalogs to be active';
  end if;
end;
$$;

alter table public.student_profiles
  add column course_catalog_release_id uuid references public.course_catalog_releases(id) on delete restrict;

alter table public.student_profiles
  drop constraint student_profiles_course_catalog_source_check;

alter table public.student_profiles
  add constraint student_profiles_course_catalog_source_check
    check (course_catalog_source in ('metamed', 'upload', 'course')),
  add constraint student_profiles_course_catalog_release_check
    check ((course_catalog_source = 'course') = (course_catalog_release_id is not null));

create index student_profiles_course_catalog_release_idx
  on public.student_profiles(course_catalog_release_id)
  where course_catalog_release_id is not null;

-- A student can only switch to a catalog that is currently active. Keeping an
-- already chosen catalog stays valid even after it is retired.
create or replace function public.validate_student_course_catalog_release()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.course_catalog_release_id is not null
    and new.course_catalog_release_id is distinct from (case when tg_op = 'UPDATE' then old.course_catalog_release_id end)
    and not exists (
      select 1 from public.course_catalog_releases r
      where r.id = new.course_catalog_release_id and r.status = 'active'
    ) then
    raise exception 'Course catalog is not available';
  end if;
  return new;
end;
$$;

create trigger validate_student_course_catalog_release
  before insert or update of course_catalog_release_id on public.student_profiles
  for each row execute function public.validate_student_course_catalog_release();

revoke execute on function public.validate_student_course_catalog_release() from public, anon, authenticated;
