create or replace function public.can_manage_clue_image_object(candidate_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clues as clue
    where clue.collection_id::text = split_part(candidate_path, '/', 1)
      and clue.id::text = split_part(candidate_path, '/', 2)
      and split_part(candidate_path, '/', 3) ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      and (
        clue.author_id = (select auth.uid())
        or (select public.can_administer_collection(clue.collection_id))
      )
  );
$$;

revoke all on function public.can_manage_clue_image_object(text) from public;
revoke all on function public.can_manage_clue_image_object(text) from anon;
grant execute on function public.can_manage_clue_image_object(text) to authenticated;

drop policy if exists "collection members can upload clue images" on storage.objects;
create policy "collection members can upload clue images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'clue-images'
  and (select public.can_manage_clue_image_object(name))
);

drop policy if exists "collection members can update clue images" on storage.objects;
create policy "collection members can update clue images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'clue-images'
  and (select public.can_manage_clue_image_object(name))
)
with check (
  bucket_id = 'clue-images'
  and (select public.can_manage_clue_image_object(name))
);

drop policy if exists "collection members can delete clue images" on storage.objects;
create policy "collection members can delete clue images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'clue-images'
  and (select public.can_manage_clue_image_object(name))
);
