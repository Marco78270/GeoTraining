-- A regular UNIQUE constraint accepts multiple NULL values and can be inferred
-- by ON CONFLICT, unlike the partial index introduced for daily XP events.
drop index if exists public.xp_events_training_session_id_key;

alter table public.xp_events
  add constraint xp_events_training_session_id_key
  unique (training_session_id);

create or replace function public.create_collection(
  collection_name text,
  collection_description text default null
)
returns public.collections
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_collection_id uuid := gen_random_uuid();
  normalized_description text := nullif(btrim(collection_description), '');
  created_collection public.collections;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  insert into public.collections (id, owner_id, name, description)
  values (new_collection_id, current_user_id, collection_name, normalized_description);

  select collection.*
  into strict created_collection
  from public.collections as collection
  where collection.id = new_collection_id;

  return created_collection;
end;
$$;

revoke all on function public.create_collection(text, text)
from public, anon;

grant execute on function public.create_collection(text, text)
to authenticated;
