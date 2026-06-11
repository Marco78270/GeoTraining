create function public.create_collection(
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
  created_collection public.collections;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  insert into public.collections (owner_id, name, description)
  values (
    current_user_id,
    collection_name,
    nullif(btrim(collection_description), '')
  )
  returning * into created_collection;

  return created_collection;
end;
$$;

revoke all on function public.create_collection(text, text)
from public, anon;

grant execute on function public.create_collection(text, text)
to authenticated;
