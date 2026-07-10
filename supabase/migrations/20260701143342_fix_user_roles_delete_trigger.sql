create or replace function public.protect_root_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_user_id uuid;
begin
  select id
    into root_user_id
  from auth.users
  where lower(email) = 'marc.roger@outlook.fr'
  limit 1;

  if root_user_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if old.user_id = root_user_id then
    if tg_op = 'DELETE' then
      raise exception using
        errcode = '23514',
        message = 'root super admin role is immutable';
    end if;

    if new.user_id is distinct from old.user_id
      or new.role <> 'super_admin' then
      raise exception using
        errcode = '23514',
        message = 'root super admin role is immutable';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;
