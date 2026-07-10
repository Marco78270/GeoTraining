alter table public.profiles
add column if not exists username_changed_at timestamptz,
add column if not exists leaderboard_visible boolean not null default true;

create temporary table profile_username_normalization (
  id uuid primary key,
  base_name text not null,
  normalized_name text
) on commit drop;

insert into profile_username_normalization (id, base_name, normalized_name)
with ranked_profiles as (
  select
    profile.id,
    profile.display_name,
    profile.email,
    row_number() over (
      partition by lower(btrim(profile.display_name))
      order by profile.id
    ) as duplicate_rank
  from public.profiles as profile
)
select
  profile.id,
  coalesce(
    nullif(btrim(profile.display_name), ''),
    nullif(split_part(coalesce(profile.email, ''), '@', 1), ''),
    'user'
  ),
  case
    when profile.display_name = btrim(profile.display_name)
      and char_length(profile.display_name) between 3 and 30
      and profile.duplicate_rank = 1
    then profile.display_name
  end
from ranked_profiles as profile;

do $$
declare
  profile record;
  username_base text;
  username_candidate text;
  collision_number integer;
  collision_suffix text;
begin
  for profile in
    select id, base_name
    from profile_username_normalization
    where normalized_name is null
    order by id
  loop
    username_base := left(profile.base_name, 21);
    username_candidate := username_base || '-' || left(profile.id::text, 8);
    collision_number := 0;

    while exists (
      select 1
      from profile_username_normalization as existing
      where lower(btrim(existing.normalized_name)) = lower(username_candidate)
    ) loop
      collision_number := collision_number + 1;
      collision_suffix := '-' || left(profile.id::text, 8) || '-' || collision_number::text;
      username_candidate := left(
        username_base,
        greatest(1, 30 - char_length(collision_suffix))
      ) || collision_suffix;
    end loop;

    update profile_username_normalization
    set normalized_name = username_candidate
    where id = profile.id;
  end loop;
end;
$$;

update public.profiles as profile
set display_name = normalized.normalized_name
from profile_username_normalization as normalized
where normalized.id = profile.id
  and profile.display_name is distinct from normalized.normalized_name;

alter table public.profiles
drop constraint if exists profiles_display_name_length;

alter table public.profiles
drop constraint if exists profiles_display_name_format;

alter table public.profiles
add constraint profiles_display_name_format check (
  display_name = btrim(display_name)
  and char_length(display_name) between 3 and 30
);

create unique index if not exists profiles_display_name_unique_idx
on public.profiles (lower(btrim(display_name)));

create or replace function public.enforce_profile_username_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.display_name is not distinct from old.display_name then
    new.username_changed_at := old.username_changed_at;
    return new;
  end if;

  if old.username_changed_at is not null
    and old.username_changed_at > clock_timestamp() - interval '30 days'
  then
    raise exception 'username can only be changed once every 30 days';
  end if;

  new.username_changed_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists profiles_enforce_username_change on public.profiles;
create trigger profiles_enforce_username_change
before update of display_name, username_changed_at on public.profiles
for each row execute function public.enforce_profile_username_change();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  username_base text;
  username_candidate text;
  collision_number integer := 0;
  collision_suffix text;
  violated_constraint text;
begin
  username_base := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
    'user'
  );

  username_base := left(username_base, 30);
  username_base := btrim(username_base);

  if char_length(username_base) < 3 then
    username_base := 'user';
  end if;

  username_candidate := username_base;

  loop
    begin
      insert into public.profiles (id, display_name, avatar_url, email)
      values (
        new.id,
        username_candidate,
        nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
        nullif(btrim(new.email), '')
      );
      exit;
    exception
      when unique_violation then
        get stacked diagnostics violated_constraint = constraint_name;
        if violated_constraint <> 'profiles_display_name_unique_idx' then
          raise;
        end if;

        collision_number := collision_number + 1;
        if collision_number = 1 then
          username_candidate := left(username_base, 21) || '-' || left(new.id::text, 8);
        else
          collision_suffix := '-' || left(new.id::text, 8) || '-' || (collision_number - 1)::text;
          username_candidate := left(
            username_base,
            greatest(1, 30 - char_length(collision_suffix))
          ) || collision_suffix;
        end if;
    end;
  end loop;

  return new;
end;
$$;

create or replace function public.handle_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = nullif(btrim(new.email), '')
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_email_updated on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create trigger on_auth_user_email_updated
after update of email on auth.users
for each row execute function public.handle_user_email_update();

revoke all on function public.enforce_profile_username_change() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_email_update() from public, anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users can read own avatar metadata" on storage.objects;
create policy "users can read own avatar metadata"
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "users can upload own avatars" on storage.objects;
create policy "users can upload own avatars"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "users can update own avatars" on storage.objects;
create policy "users can update own avatars"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "users can delete own avatars" on storage.objects;
create policy "users can delete own avatars"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
