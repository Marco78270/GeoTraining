drop function if exists public.manage_platform_role(uuid, public.platform_role);

create or replace function public.manage_platform_role(
  target_user_id uuid,
  target_role public.platform_role default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid;
  requester_role public.platform_role;
  root_user_id uuid;
  deleted_count integer := 0;
begin
  requester_id := auth.uid();

  if requester_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  select role
    into requester_role
  from public.user_roles
  where user_id = requester_id;

  if requester_role <> 'super_admin' then
    raise exception using
      errcode = '42501',
      message = 'super admin required';
  end if;

  if target_user_id = requester_id then
    raise exception using
      errcode = '42501',
      message = 'self role change forbidden';
  end if;

  select id
    into root_user_id
  from auth.users
  where lower(email) = 'marc.roger@outlook.fr'
  limit 1;

  if root_user_id is not null
    and target_user_id = root_user_id
    and target_role is distinct from 'super_admin'::public.platform_role then
    raise exception using
      errcode = '23514',
      message = 'root super admin role is immutable';
  end if;

  if target_role is null then
    delete from public.user_roles
    where user_id = target_user_id;

    get diagnostics deleted_count = row_count;

    if deleted_count = 0 then
      raise exception using
        errcode = 'P0002',
        message = 'platform role not found';
    end if;

    return true;
  end if;

  insert into public.user_roles (user_id, role)
  values (target_user_id, target_role)
  on conflict (user_id) do update
  set role = excluded.role,
      updated_at = timezone('utc', now());

  return true;
end;
$$;

revoke all on function public.manage_platform_role(uuid, public.platform_role) from public, anon;
grant execute on function public.manage_platform_role(uuid, public.platform_role) to authenticated;
