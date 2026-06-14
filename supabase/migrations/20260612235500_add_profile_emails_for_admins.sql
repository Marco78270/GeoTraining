alter table public.profiles
add column if not exists email text;

create unique index if not exists profiles_email_unique_idx
on public.profiles (lower(email))
where email is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      ''
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    nullif(btrim(new.email), '')
  )
  on conflict (id) do update
  set display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name, avatar_url, email)
select
  id,
  coalesce(
    nullif(btrim(raw_user_meta_data ->> 'display_name'), ''),
    split_part(coalesce(email, ''), '@', 1),
    ''
  ),
  raw_user_meta_data ->> 'avatar_url',
  nullif(btrim(email), '')
from auth.users
on conflict (id) do update
set display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    email = excluded.email;

alter policy "users can read relevant profiles"
on public.profiles
using (
  (select public.shares_collection_with(id))
  or (select public.is_platform_admin())
);
