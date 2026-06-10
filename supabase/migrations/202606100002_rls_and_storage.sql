create function public.is_collection_member(target_collection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.collection_members as member
    where member.collection_id = target_collection_id
      and member.user_id = auth.uid()
  );
$$;

create function public.is_collection_owner(target_collection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.collections as collection
    where collection.id = target_collection_id
      and collection.owner_id = auth.uid()
  );
$$;

revoke all on function public.is_collection_member(uuid) from public;
revoke all on function public.is_collection_owner(uuid) from public;
grant execute on function public.is_collection_member(uuid) to authenticated;
grant execute on function public.is_collection_owner(uuid) to authenticated;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.collections to authenticated;
grant select, insert, update, delete on public.collection_members to authenticated;
grant select, insert, update, delete on public.collection_invitations to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select on public.countries to authenticated;
grant select on public.regions to authenticated;
grant select, insert, update, delete on public.clues to authenticated;
grant select, insert, update, delete on public.clue_regions to authenticated;
grant select, insert, update, delete on public.clue_images to authenticated;
grant select, insert, update, delete on public.training_sessions to authenticated;
grant select, insert, update, delete on public.training_answers to authenticated;

alter table public.profiles enable row level security;
alter table public.collections enable row level security;
alter table public.collection_members enable row level security;
alter table public.collection_invitations enable row level security;
alter table public.categories enable row level security;
alter table public.countries enable row level security;
alter table public.regions enable row level security;
alter table public.clues enable row level security;
alter table public.clue_regions enable row level security;
alter table public.clue_images enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_answers enable row level security;

create policy "authenticated users can read profiles"
on public.profiles for select
to authenticated
using (true);

create policy "users can update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "collection members can read"
on public.collections for select
to authenticated
using ((select public.is_collection_member(id)));

create policy "users can create collections"
on public.collections for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "owners can update collections"
on public.collections for update
to authenticated
using ((select public.is_collection_owner(id)))
with check ((select public.is_collection_owner(id)));

create policy "owners can delete collections"
on public.collections for delete
to authenticated
using ((select public.is_collection_owner(id)));

create policy "collection members can read memberships"
on public.collection_members for select
to authenticated
using ((select public.is_collection_member(collection_id)));

create policy "owners can add memberships"
on public.collection_members for insert
to authenticated
with check (
  (select public.is_collection_owner(collection_id))
  and role = 'editor'
);

create policy "owners can update memberships"
on public.collection_members for update
to authenticated
using (
  (select public.is_collection_owner(collection_id))
  and role = 'editor'
)
with check (
  (select public.is_collection_owner(collection_id))
  and role = 'editor'
);

create policy "owners can delete memberships"
on public.collection_members for delete
to authenticated
using (
  (select public.is_collection_owner(collection_id))
  and role = 'editor'
);

create policy "collection members can read invitations"
on public.collection_invitations for select
to authenticated
using ((select public.is_collection_member(collection_id)));

create policy "owners can create invitations"
on public.collection_invitations for insert
to authenticated
with check (
  (select public.is_collection_owner(collection_id))
  and invited_by = (select auth.uid())
  and role = 'editor'
);

create policy "owners can update invitations"
on public.collection_invitations for update
to authenticated
using ((select public.is_collection_owner(collection_id)))
with check (
  (select public.is_collection_owner(collection_id))
  and role = 'editor'
);

create policy "owners can delete invitations"
on public.collection_invitations for delete
to authenticated
using ((select public.is_collection_owner(collection_id)));

create policy "collection members can read categories"
on public.categories for select
to authenticated
using ((select public.is_collection_member(collection_id)));

create policy "collection members can create categories"
on public.categories for insert
to authenticated
with check ((select public.is_collection_member(collection_id)));

create policy "collection members can update categories"
on public.categories for update
to authenticated
using ((select public.is_collection_member(collection_id)))
with check ((select public.is_collection_member(collection_id)));

create policy "collection members can delete categories"
on public.categories for delete
to authenticated
using ((select public.is_collection_member(collection_id)));

create policy "authenticated users can read countries"
on public.countries for select
to authenticated
using (true);

create policy "authenticated users can read regions"
on public.regions for select
to authenticated
using (true);

create policy "collection members can read clues"
on public.clues for select
to authenticated
using ((select public.is_collection_member(collection_id)));

create policy "collection members can create clues"
on public.clues for insert
to authenticated
with check (
  (select public.is_collection_member(collection_id))
  and created_by = (select auth.uid())
);

create policy "collection members can update clues"
on public.clues for update
to authenticated
using ((select public.is_collection_member(collection_id)))
with check ((select public.is_collection_member(collection_id)));

create policy "collection members can delete clues"
on public.clues for delete
to authenticated
using ((select public.is_collection_member(collection_id)));

create policy "collection members can read clue regions"
on public.clue_regions for select
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_regions.clue_id
      and (select public.is_collection_member(clue.collection_id))
  )
);

create policy "collection members can create clue regions"
on public.clue_regions for insert
to authenticated
with check (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_regions.clue_id
      and (select public.is_collection_member(clue.collection_id))
  )
);

create policy "collection members can update clue regions"
on public.clue_regions for update
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_regions.clue_id
      and (select public.is_collection_member(clue.collection_id))
  )
)
with check (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_regions.clue_id
      and (select public.is_collection_member(clue.collection_id))
  )
);

create policy "collection members can delete clue regions"
on public.clue_regions for delete
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_regions.clue_id
      and (select public.is_collection_member(clue.collection_id))
  )
);

create policy "collection members can read clue images"
on public.clue_images for select
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_images.clue_id
      and (select public.is_collection_member(clue.collection_id))
  )
);

create policy "collection members can create clue images"
on public.clue_images for insert
to authenticated
with check (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_images.clue_id
      and (select public.is_collection_member(clue.collection_id))
  )
);

create policy "collection members can update clue images"
on public.clue_images for update
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_images.clue_id
      and (select public.is_collection_member(clue.collection_id))
  )
)
with check (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_images.clue_id
      and (select public.is_collection_member(clue.collection_id))
  )
);

create policy "collection members can delete clue images"
on public.clue_images for delete
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_images.clue_id
      and (select public.is_collection_member(clue.collection_id))
  )
);

create policy "users can read own training sessions"
on public.training_sessions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users can create own training sessions"
on public.training_sessions for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (select public.is_collection_member(collection_id))
);

create policy "users can update own training sessions"
on public.training_sessions for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (select public.is_collection_member(collection_id))
);

create policy "users can delete own training sessions"
on public.training_sessions for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "users can read own training answers"
on public.training_answers for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users can create own training answers"
on public.training_answers for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users can update own training answers"
on public.training_answers for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users can delete own training answers"
on public.training_answers for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'clue-images',
  'clue-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "collection members can read clue images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'clue-images'
  and name ~ '^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}/'
  and (
    select public.is_collection_member(
      (storage.foldername(name))[1]::uuid
    )
  )
);

create policy "collection members can upload clue images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'clue-images'
  and name ~ '^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}/'
  and (
    select public.is_collection_member(
      (storage.foldername(name))[1]::uuid
    )
  )
);

create policy "collection members can update clue images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'clue-images'
  and name ~ '^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}/'
  and (
    select public.is_collection_member(
      (storage.foldername(name))[1]::uuid
    )
  )
)
with check (
  bucket_id = 'clue-images'
  and name ~ '^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}/'
  and (
    select public.is_collection_member(
      (storage.foldername(name))[1]::uuid
    )
  )
);

create policy "collection members can delete clue images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'clue-images'
  and name ~ '^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}/'
  and (
    select public.is_collection_member(
      (storage.foldername(name))[1]::uuid
    )
  )
);
