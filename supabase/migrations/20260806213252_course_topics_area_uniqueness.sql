alter table public.course_topics
  drop constraint if exists course_topics_user_id_title_specialty_key;

alter table public.course_topics
  add constraint course_topics_user_area_title_specialty_key
  unique (user_id, major_area, title, specialty);
