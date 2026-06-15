create or replace function public.can_administer_collection(target_collection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_collection_owner(target_collection_id)
    or (
      public.is_collection_public(target_collection_id)
      and public.is_platform_admin()
    ),
    false
  );
$$;

revoke all on function public.can_administer_collection(uuid) from public, anon;
grant execute on function public.can_administer_collection(uuid) to authenticated;

create or replace function public.can_access_clue_image_object(candidate_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when candidate_path ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
    then exists (
      select 1
      from public.clues as clue
      where clue.id = split_part(candidate_path, '/', 2)::uuid
        and clue.collection_id = split_part(candidate_path, '/', 1)::uuid
        and (
          clue.status = 'draft'
          or exists (
            select 1
            from public.clue_images as image
            where image.id = split_part(
              split_part(candidate_path, '/', 3),
              '.',
              1
            )::uuid
              and image.clue_id = clue.id
              and image.storage_path = candidate_path
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
    )
    else false
  end;
$$;

create or replace function public.can_manage_clue_image_object(candidate_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when candidate_path ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
    then exists (
      select 1
      from public.clues as clue
      where clue.id = split_part(candidate_path, '/', 2)::uuid
        and clue.collection_id = split_part(candidate_path, '/', 1)::uuid
        and public.can_administer_collection(clue.collection_id)
    )
    else false
  end;
$$;

drop policy if exists "owners can update collections" on public.collections;
create policy "admins can update manageable collections"
on public.collections for update
to authenticated
using ((select public.can_administer_collection(id)))
with check ((select public.can_administer_collection(id)));

drop policy if exists "collection members can create categories" on public.categories;
create policy "admins can create categories in manageable collections"
on public.categories for insert
to authenticated
with check ((select public.can_administer_collection(collection_id)));

drop policy if exists "collection members can update categories" on public.categories;
create policy "admins can update categories in manageable collections"
on public.categories for update
to authenticated
using ((select public.can_administer_collection(collection_id)))
with check ((select public.can_administer_collection(collection_id)));

drop policy if exists "collection members can delete categories" on public.categories;
create policy "admins can delete categories in manageable collections"
on public.categories for delete
to authenticated
using ((select public.can_administer_collection(collection_id)));

drop policy if exists "collection members can create clues" on public.clues;
create policy "admins can create clues in manageable collections"
on public.clues for insert
to authenticated
with check (
  (select public.can_administer_collection(collection_id))
  and author_id = (select auth.uid())
);

drop policy if exists "collection members can update clues" on public.clues;
create policy "admins can update clues in manageable collections"
on public.clues for update
to authenticated
using ((select public.can_administer_collection(collection_id)))
with check ((select public.can_administer_collection(collection_id)));

drop policy if exists "collection members can delete clues" on public.clues;
create policy "admins can delete clues in manageable collections"
on public.clues for delete
to authenticated
using ((select public.can_administer_collection(collection_id)));

drop policy if exists "collection members can create clue regions" on public.clue_regions;
create policy "admins can create clue regions in manageable collections"
on public.clue_regions for insert
to authenticated
with check (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_regions.clue_id
      and (select public.can_administer_collection(clue.collection_id))
  )
);

drop policy if exists "collection members can update clue regions" on public.clue_regions;
create policy "admins can update clue regions in manageable collections"
on public.clue_regions for update
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_regions.clue_id
      and (select public.can_administer_collection(clue.collection_id))
  )
)
with check (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_regions.clue_id
      and (select public.can_administer_collection(clue.collection_id))
  )
);

drop policy if exists "collection members can delete clue regions" on public.clue_regions;
create policy "admins can delete clue regions in manageable collections"
on public.clue_regions for delete
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_regions.clue_id
      and (select public.can_administer_collection(clue.collection_id))
  )
);

drop policy if exists "collection members can create clue images" on public.clue_images;
create policy "admins can create clue images in manageable collections"
on public.clue_images for insert
to authenticated
with check (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_images.clue_id
      and (select public.can_administer_collection(clue.collection_id))
  )
);

drop policy if exists "collection members can update clue images" on public.clue_images;
create policy "admins can update clue images in manageable collections"
on public.clue_images for update
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_images.clue_id
      and (select public.can_administer_collection(clue.collection_id))
  )
)
with check (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_images.clue_id
      and (select public.can_administer_collection(clue.collection_id))
  )
);

drop policy if exists "collection members can delete clue images" on public.clue_images;
create policy "admins can delete clue images in manageable collections"
on public.clue_images for delete
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_images.clue_id
      and (select public.can_administer_collection(clue.collection_id))
  )
);
