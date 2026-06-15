create type public.platform_role as enum ('admin', 'super_admin');

create table public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.platform_role not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger user_roles_set_updated_at
before update on public.user_roles
for each row execute function public.set_updated_at();

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'super_admin'
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;

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

  return new;
end;
$$;

create trigger user_roles_protect_root_super_admin
before update or delete on public.user_roles
for each row execute function public.protect_root_super_admin();

revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;

grant select, insert, update, delete on public.user_roles to authenticated;

alter table public.user_roles enable row level security;

create policy "users can read own platform role"
on public.user_roles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "platform admins can read all platform roles"
on public.user_roles for select
to authenticated
using ((select public.is_platform_admin()));

create policy "super admin can insert platform roles"
on public.user_roles for insert
to authenticated
with check ((select public.is_super_admin()));

create policy "super admin can update platform roles"
on public.user_roles for update
to authenticated
using ((select public.is_super_admin()))
with check ((select public.is_super_admin()));

create policy "super admin can delete platform roles"
on public.user_roles for delete
to authenticated
using ((select public.is_super_admin()));

insert into public.user_roles (user_id, role)
select id, 'super_admin'::public.platform_role
from auth.users
where lower(email) = 'marc.roger@outlook.fr'
on conflict (user_id) do update
set role = 'super_admin',
    updated_at = timezone('utc', now());
