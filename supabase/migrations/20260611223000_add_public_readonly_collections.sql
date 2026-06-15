create type public.collection_visibility as enum ('private', 'public_readonly');

alter table public.collections
  alter column owner_id drop not null;

alter table public.collections
  add column visibility public.collection_visibility not null default 'private';

alter table public.collections
  add constraint collections_private_owner_required
  check (
    visibility = 'public_readonly'
    or owner_id is not null
  );

create or replace function public.add_collection_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is not null then
    insert into public.collection_members (collection_id, user_id, role)
    values (new.id, new.owner_id, 'owner');
  end if;
  return new;
end;
$$;

create or replace function public.is_collection_public(target_collection_id uuid)
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
      and collection.visibility = 'public_readonly'
  );
$$;

create or replace function public.can_read_collection(target_collection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_collection_member(target_collection_id)
    or public.is_collection_public(target_collection_id),
    false
  );
$$;

create or replace function public.can_read_collection_clue(
  target_collection_id uuid,
  target_status public.clue_status
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_collection_member(target_collection_id)
    or (
      public.is_collection_public(target_collection_id)
      and target_status = 'published'
    ),
    false
  );
$$;

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
            and public.is_collection_member(clue.collection_id)
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

revoke all on function public.is_collection_public(uuid) from public, anon;
revoke all on function public.can_read_collection(uuid) from public, anon;
revoke all on function public.can_read_collection_clue(uuid, public.clue_status) from public, anon;
grant execute on function public.is_collection_public(uuid) to authenticated;
grant execute on function public.can_read_collection(uuid) to authenticated;
grant execute on function public.can_read_collection_clue(uuid, public.clue_status) to authenticated;

drop policy if exists "collection members can read" on public.collections;
create policy "collection members can read"
on public.collections for select
to authenticated
using ((select public.can_read_collection(id)));

drop policy if exists "collection members can read categories" on public.categories;
create policy "collection members can read categories"
on public.categories for select
to authenticated
using ((select public.can_read_collection(collection_id)));

drop policy if exists "collection members can read clues" on public.clues;
create policy "collection members can read clues"
on public.clues for select
to authenticated
using ((select public.can_read_collection_clue(collection_id, status)));

drop policy if exists "collection members can read clue regions" on public.clue_regions;
create policy "collection members can read clue regions"
on public.clue_regions for select
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_regions.clue_id
      and (select public.can_read_collection_clue(clue.collection_id, clue.status))
  )
);

drop policy if exists "collection members can read clue images" on public.clue_images;
create policy "collection members can read clue images"
on public.clue_images for select
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_images.clue_id
      and (select public.can_read_collection_clue(clue.collection_id, clue.status))
  )
);

drop policy if exists "users can create own training sessions" on public.training_sessions;
create policy "users can create own training sessions"
on public.training_sessions for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    (mode = 'world' and (select public.can_read_collection(collection_id)))
    or (mode = 'country' and (select public.can_read_collection(collection_id)))
  )
);
