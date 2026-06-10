create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.collection_role as enum ('owner', 'editor');
create type public.coverage_mode as enum ('whole_country', 'selected_regions');
create type public.clue_difficulty as enum ('easy', 'medium', 'expert');
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'expired', 'revoked');
create type public.training_mode as enum ('world', 'country');
create type public.clue_status as enum ('draft', 'published');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) <= 80)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collections_name_not_blank check (char_length(btrim(name)) between 1 and 120),
  constraint collections_description_length check (char_length(description) <= 1000)
);

create table public.collection_members (
  collection_id uuid not null references public.collections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.collection_role not null default 'editor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);

create table public.collection_invitations (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  email extensions.citext not null,
  role public.collection_role not null default 'editor',
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_invitations_email_not_blank check (char_length(btrim(email::text)) > 3),
  constraint collection_invitations_editor_only check (role = 'editor'),
  constraint collection_invitations_expiry_after_creation check (expires_at > created_at)
);

create unique index collection_invitations_pending_email_idx
  on public.collection_invitations (collection_id, email)
  where status = 'pending';

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (char_length(btrim(name)) between 1 and 80),
  constraint categories_color_format check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  unique (id, collection_id),
  unique (collection_id, name)
);

create table public.countries (
  code text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint countries_iso_alpha_2 check (code ~ '^[A-Z]{2}$'),
  constraint countries_name_not_blank check (char_length(btrim(name)) > 0),
  unique (name)
);

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code) on delete cascade,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regions_code_not_blank check (char_length(btrim(code)) > 0),
  constraint regions_name_not_blank check (char_length(btrim(name)) > 0),
  unique (country_code, code),
  unique (id, country_code)
);

create table public.clues (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  category_id uuid not null,
  country_code text not null references public.countries(code) on delete restrict,
  coverage public.coverage_mode not null default 'whole_country',
  difficulty public.clue_difficulty not null default 'easy',
  status public.clue_status not null default 'draft',
  title text not null,
  characteristics text[] not null default '{}',
  notes text,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clues_title_not_blank check (char_length(btrim(title)) between 1 and 160),
  constraint clues_notes_length check (char_length(notes) <= 5000),
  constraint clues_category_same_collection
    foreign key (category_id, collection_id)
    references public.categories(id, collection_id)
    on delete restrict
);

create table public.clue_regions (
  clue_id uuid not null references public.clues(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (clue_id, region_id)
);

create table public.clue_images (
  id uuid primary key default gen_random_uuid(),
  clue_id uuid not null references public.clues(id) on delete cascade,
  storage_path text not null unique,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clue_images_path_not_blank check (char_length(btrim(storage_path)) > 0),
  constraint clue_images_alt_text_length check (char_length(alt_text) <= 300),
  constraint clue_images_sort_order_nonnegative check (sort_order >= 0),
  unique (clue_id, sort_order)
);

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  mode public.training_mode not null,
  country_code text references public.countries(code) on delete restrict,
  category_id uuid,
  correct_answers integer not null default 0,
  total_answers integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_sessions_country_mode check (
    (mode = 'world' and country_code is null)
    or (mode = 'country' and country_code is not null)
  ),
  constraint training_sessions_score_bounds check (
    correct_answers >= 0
    and total_answers >= 0
    and correct_answers <= total_answers
  ),
  constraint training_sessions_completion_after_start check (
    completed_at is null or completed_at >= started_at
  ),
  constraint training_sessions_category_same_collection
    foreign key (category_id, collection_id)
    references public.categories(id, collection_id)
    on delete restrict,
  unique (id, user_id)
);

create table public.training_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  clue_id uuid not null references public.clues(id) on delete restrict,
  selected_country_code text references public.countries(code) on delete restrict,
  selected_region_id uuid references public.regions(id) on delete restrict,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint training_answers_session_owner
    foreign key (session_id, user_id)
    references public.training_sessions(id, user_id)
    on delete cascade
);

create index collections_owner_id_idx on public.collections(owner_id);
create index collection_members_user_id_idx on public.collection_members(user_id);
create index collection_invitations_collection_id_idx on public.collection_invitations(collection_id);
create index collection_invitations_invited_by_idx on public.collection_invitations(invited_by);
create index collection_invitations_accepted_by_idx on public.collection_invitations(accepted_by);
create index categories_collection_id_idx on public.categories(collection_id);
create index regions_country_code_idx on public.regions(country_code);
create index clues_collection_id_idx on public.clues(collection_id);
create index clues_category_id_collection_id_idx on public.clues(category_id, collection_id);
create index clues_country_code_idx on public.clues(country_code);
create index clues_collection_status_idx on public.clues(collection_id, status);
create index clues_created_by_idx on public.clues(created_by);
create index clue_regions_region_id_idx on public.clue_regions(region_id);
create index clue_images_clue_id_idx on public.clue_images(clue_id);
create index training_sessions_user_id_idx on public.training_sessions(user_id);
create index training_sessions_collection_id_idx on public.training_sessions(collection_id);
create index training_sessions_category_id_collection_id_idx
  on public.training_sessions(category_id, collection_id);
create index training_sessions_country_code_idx on public.training_sessions(country_code);
create index training_answers_session_id_user_id_idx
  on public.training_answers(session_id, user_id);
create index training_answers_user_id_idx on public.training_answers(user_id);
create index training_answers_clue_id_idx on public.training_answers(clue_id);
create index training_answers_selected_country_code_idx
  on public.training_answers(selected_country_code);
create index training_answers_selected_region_id_idx
  on public.training_answers(selected_region_id);

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger collections_set_updated_at
before update on public.collections
for each row execute function public.set_updated_at();

create trigger collection_members_set_updated_at
before update on public.collection_members
for each row execute function public.set_updated_at();

create trigger collection_invitations_set_updated_at
before update on public.collection_invitations
for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger countries_set_updated_at
before update on public.countries
for each row execute function public.set_updated_at();

create trigger regions_set_updated_at
before update on public.regions
for each row execute function public.set_updated_at();

create trigger clues_set_updated_at
before update on public.clues
for each row execute function public.set_updated_at();

create trigger clue_images_set_updated_at
before update on public.clue_images
for each row execute function public.set_updated_at();

create trigger training_sessions_set_updated_at
before update on public.training_sessions
for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      ''
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create function public.add_collection_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.collection_members (collection_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger on_collection_created
after insert on public.collections
for each row execute function public.add_collection_owner_membership();

create function public.protect_collection_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception using
      errcode = '23514',
      message = 'collection owner_id is immutable';
  end if;
  return new;
end;
$$;

create trigger collections_protect_owner
before update on public.collections
for each row execute function public.protect_collection_owner();

create function public.protect_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
    and exists (
      select 1
      from public.collections as collection
      where collection.id = old.collection_id
        and collection.owner_id = old.user_id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'collection owner membership is immutable';
  end if;

  if tg_op = 'UPDATE' then
    return new;
  end if;
  return old;
end;
$$;

create trigger collection_members_protect_owner
before update or delete on public.collection_members
for each row execute function public.protect_owner_membership();

create function public.validate_clue_region_country()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  clue_country text;
  clue_coverage public.coverage_mode;
  region_country text;
begin
  select country_code, coverage into clue_country, clue_coverage
  from public.clues
  where id = new.clue_id;

  if clue_coverage <> 'selected_regions' then
    raise exception using
      errcode = '23514',
      message = 'whole-country clues cannot have selected regions';
  end if;

  select country_code into region_country
  from public.regions
  where id = new.region_id;

  if clue_country is distinct from region_country then
    raise exception using
      errcode = '23514',
      message = 'clue region must belong to the clue country';
  end if;

  return new;
end;
$$;

create trigger clue_regions_validate_country
before insert or update on public.clue_regions
for each row execute function public.validate_clue_region_country();

create function public.validate_clue_geography()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.coverage = 'whole_country'
    and exists (
      select 1
      from public.clue_regions
      where clue_id = new.id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'whole-country clues cannot have selected regions';
  end if;

  if exists (
    select 1
    from public.clue_regions as clue_region
    join public.regions as region on region.id = clue_region.region_id
    where clue_region.clue_id = new.id
      and region.country_code <> new.country_code
  )
  then
    raise exception using
      errcode = '23514',
      message = 'clue region must belong to the clue country';
  end if;

  return new;
end;
$$;

create trigger clues_validate_geography
before update of country_code or coverage on public.clues
for each row execute function public.validate_clue_geography();

create function public.validate_clue_image_path()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  expected_prefix text;
begin
  select collection_id::text || '/' into expected_prefix
  from public.clues
  where id = new.clue_id;

  if new.storage_path not like expected_prefix || '%' then
    raise exception using
      errcode = '23514',
      message = 'clue image path must begin with the collection id';
  end if;

  return new;
end;
$$;

create trigger clue_images_validate_path
before insert or update on public.clue_images
for each row execute function public.validate_clue_image_path();

create function public.validate_published_clue()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'published' then
    if not exists (
      select 1
      from public.clue_images
      where clue_id = new.id
    ) then
      raise exception using
        errcode = '23514',
        message = 'published clues require at least one image';
    end if;

    if new.coverage = 'selected_regions'
      and not exists (
        select 1
        from public.clue_regions
        where clue_id = new.id
      )
    then
      raise exception using
        errcode = '23514',
        message = 'published regional clues require at least one region';
    end if;
  end if;

  return new;
end;
$$;

create trigger clues_validate_publication
before insert or update on public.clues
for each row execute function public.validate_published_clue();

create function public.protect_published_clue_children()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_clue_id uuid;
  target_status public.clue_status;
  target_coverage public.coverage_mode;
begin
  target_clue_id = old.clue_id;

  select status, coverage
  into target_status, target_coverage
  from public.clues
  where id = target_clue_id;

  if target_status = 'published' and tg_table_name = 'clue_images'
    and not exists (
      select 1
      from public.clue_images
      where clue_id = target_clue_id
        and id <> old.id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'published clues require at least one image';
  end if;

  if target_status = 'published'
    and target_coverage = 'selected_regions'
    and tg_table_name = 'clue_regions'
    and not exists (
      select 1
      from public.clue_regions
      where clue_id = target_clue_id
        and region_id <> old.region_id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'published regional clues require at least one region';
  end if;

  if tg_op = 'UPDATE' then
    return new;
  end if;
  return old;
end;
$$;

create trigger clue_images_protect_published
before update of clue_id or delete on public.clue_images
for each row execute function public.protect_published_clue_children();

create trigger clue_regions_protect_published
before update of clue_id or delete on public.clue_regions
for each row execute function public.protect_published_clue_children();

create function public.validate_training_answer_collection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_collection_id uuid;
  clue_collection_id uuid;
begin
  select collection_id into session_collection_id
  from public.training_sessions
  where id = new.session_id
    and user_id = new.user_id;

  select collection_id into clue_collection_id
  from public.clues
  where id = new.clue_id;

  if session_collection_id is null
    or clue_collection_id is null
    or session_collection_id <> clue_collection_id
  then
    raise exception using
      errcode = '23514',
      message = 'training answer clue must belong to the session collection';
  end if;

  return new;
end;
$$;

create trigger training_answers_validate_collection
before insert or update of session_id, user_id, clue_id on public.training_answers
for each row execute function public.validate_training_answer_collection();

revoke all on function public.handle_new_user() from public;
revoke all on function public.add_collection_owner_membership() from public;
revoke all on function public.protect_owner_membership() from public;
revoke all on function public.validate_training_answer_collection() from public;
