create or replace function public.can_access_clue_image_object(candidate_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clues as clue
    join public.clue_images as image
      on image.clue_id = clue.id
     and image.storage_path = candidate_path
    where (
      (
        clue.status = 'draft'
        and public.can_administer_collection(clue.collection_id)
      )
      or (
        clue.status = 'published'
        and public.is_collection_public(clue.collection_id)
      )
    )
  );
$$;

revoke all on function public.can_access_clue_image_object(text) from public;
grant execute on function public.can_access_clue_image_object(text) to anon;
grant execute on function public.can_access_clue_image_object(text) to authenticated;

drop policy if exists "collection members can read clue images" on storage.objects;
create policy "collection members can read clue images"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'clue-images'
  and (select public.can_access_clue_image_object(name))
);
