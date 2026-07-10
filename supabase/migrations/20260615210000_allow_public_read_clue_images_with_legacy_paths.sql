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
      clue.status = 'draft'
      or exists (
        select 1
        from storage.objects as object
        where object.bucket_id = 'clue-images'
          and object.name = image.storage_path
      )
    )
      and (
        (
          clue.status = 'draft'
          and public.can_administer_collection(clue.collection_id)
        )
        or (
          clue.status = 'published'
          and public.can_read_collection_clue(clue.collection_id, clue.status)
        )
      )
  );
$$;
