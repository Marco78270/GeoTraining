do $$
declare
  target_user_id uuid;
begin
  select id
    into target_user_id
  from auth.users
  where lower(email) = 'marc.roger@outlook.fr'
  limit 1;

  if target_user_id is null then
    return;
  end if;

  update public.collections
     set owner_id = target_user_id
   where visibility = 'public_readonly';

  insert into public.collection_members (collection_id, user_id, role)
  select id, target_user_id, 'owner'::public.collection_role
    from public.collections
   where visibility = 'public_readonly'
  on conflict (collection_id, user_id) do update
    set role = 'owner',
        updated_at = timezone('utc', now());
end;
$$;
