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
  current_user_id uuid := auth.uid();
  collection_id uuid := gen_random_uuid();
  created_at timestamptz := now();
  normalized_description text := nullif(btrim(collection_description), '');
  created_collection public.collections;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  insert into public.collections (
    id,
    owner_id,
    name,
    description,
    created_at,
    updated_at
  )
  values (
    collection_id,
    current_user_id,
    collection_name,
    normalized_description,
    created_at,
    created_at
  );

  select
    collection_id,
    current_user_id,
    collection_name,
    normalized_description,
    created_at,
    created_at
  into created_collection;

  return created_collection;
end;
$$;
