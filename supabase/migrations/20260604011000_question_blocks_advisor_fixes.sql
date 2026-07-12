create index if not exists question_blocks_area_id_idx
  on public.question_blocks (area_id);

create index if not exists question_blocks_exam_target_id_idx
  on public.question_blocks (exam_target_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop policy if exists "Users can select their exam targets" on public.exam_targets;
drop policy if exists "Users can insert their exam targets" on public.exam_targets;
drop policy if exists "Users can update their exam targets" on public.exam_targets;
drop policy if exists "Users can delete their exam targets" on public.exam_targets;

create policy "Users can select their exam targets"
  on public.exam_targets for select
  using ((select auth.uid()) = user_id);

create policy "Users can insert their exam targets"
  on public.exam_targets for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their exam targets"
  on public.exam_targets for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their exam targets"
  on public.exam_targets for delete
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can select their areas" on public.areas;
drop policy if exists "Users can insert their areas" on public.areas;
drop policy if exists "Users can update their areas" on public.areas;
drop policy if exists "Users can delete their areas" on public.areas;

create policy "Users can select their areas"
  on public.areas for select
  using ((select auth.uid()) = user_id);

create policy "Users can insert their areas"
  on public.areas for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their areas"
  on public.areas for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their areas"
  on public.areas for delete
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can select their question blocks" on public.question_blocks;
drop policy if exists "Users can insert their question blocks" on public.question_blocks;
drop policy if exists "Users can update their question blocks" on public.question_blocks;
drop policy if exists "Users can delete their question blocks" on public.question_blocks;

create policy "Users can select their question blocks"
  on public.question_blocks for select
  using ((select auth.uid()) = user_id);

create policy "Users can insert their question blocks"
  on public.question_blocks for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their question blocks"
  on public.question_blocks for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their question blocks"
  on public.question_blocks for delete
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can select their block reviews" on public.block_reviews;
drop policy if exists "Users can insert their block reviews" on public.block_reviews;
drop policy if exists "Users can update their block reviews" on public.block_reviews;
drop policy if exists "Users can delete their block reviews" on public.block_reviews;

create policy "Users can select their block reviews"
  on public.block_reviews for select
  using ((select auth.uid()) = user_id);

create policy "Users can insert their block reviews"
  on public.block_reviews for insert
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.question_blocks
      where question_blocks.id = block_reviews.block_id
        and question_blocks.user_id = (select auth.uid())
    )
  );

create policy "Users can update their block reviews"
  on public.block_reviews for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.question_blocks
      where question_blocks.id = block_reviews.block_id
        and question_blocks.user_id = (select auth.uid())
    )
  );

create policy "Users can delete their block reviews"
  on public.block_reviews for delete
  using ((select auth.uid()) = user_id);
