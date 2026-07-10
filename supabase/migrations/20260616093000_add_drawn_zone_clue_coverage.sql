alter type public.coverage_mode add value if not exists 'drawn_zone';

create table public.clue_zones (
  clue_id uuid primary key references public.clues(id) on delete cascade,
  geojson jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint clue_zones_geojson_type_check
    check (geojson ->> 'type' = 'Polygon'),
  constraint clue_zones_geojson_coordinates_check
    check (jsonb_typeof(geojson -> 'coordinates') = 'array')
);

create trigger clue_zones_set_updated_at
before update on public.clue_zones
for each row execute function public.set_updated_at();

create or replace function public.validate_clue_zone_geojson()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  clue_coverage public.coverage_mode;
begin
  select coverage into clue_coverage
  from public.clues
  where id = new.clue_id
  for update;

  if clue_coverage <> 'drawn_zone' then
    raise exception using
      errcode = '23514',
      message = 'only drawn-zone clues can have stored clue zones';
  end if;

  if jsonb_array_length(new.geojson -> 'coordinates') = 0 then
    raise exception using
      errcode = '23514',
      message = 'drawn-zone clues require polygon coordinates';
  end if;

  return new;
end;
$$;

create trigger clue_zones_validate_geojson
before insert or update on public.clue_zones
for each row execute function public.validate_clue_zone_geojson();

create or replace function public.validate_clue_geography()
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

  if new.coverage = 'whole_country'
    and exists (
      select 1
      from public.clue_zones
      where clue_id = new.id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'whole-country clues cannot have drawn zones';
  end if;

  if new.coverage = 'selected_regions'
    and exists (
      select 1
      from public.clue_zones
      where clue_id = new.id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'regional clues cannot have drawn zones';
  end if;

  if new.coverage = 'drawn_zone'
    and exists (
      select 1
      from public.clue_regions
      where clue_id = new.id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'drawn-zone clues cannot have selected regions';
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

create or replace function public.validate_published_clue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' then
    if not public.has_stored_clue_image(new.id) then
      raise exception using
        errcode = '23514',
        message = 'published clues require at least one stored image';
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

    if new.coverage = 'drawn_zone'
      and not exists (
        select 1
        from public.clue_zones
        where clue_id = new.id
      )
    then
      raise exception using
        errcode = '23514',
        message = 'published drawn-zone clues require a stored zone';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.protect_published_clue_children()
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
  where id = target_clue_id
  for update;

  if target_status = 'published' and tg_table_name = 'clue_images' then
    if tg_op = 'UPDATE'
      and (
        new.clue_id is distinct from old.clue_id
        or new.storage_path is distinct from old.storage_path
      )
    then
      raise exception using
        errcode = '23514',
        message = 'published clue images require draft status before path changes';
    end if;

    if tg_op = 'DELETE'
      and not exists (
        select 1
        from public.clue_images
        where clue_id = target_clue_id
          and id <> old.id
      )
    then
      raise exception using
        errcode = '23514',
        message = 'published clues require at least one image metadata row';
    end if;
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

  if target_status = 'published'
    and target_coverage = 'drawn_zone'
    and tg_table_name = 'clue_zones'
  then
    raise exception using
      errcode = '23514',
      message = 'published drawn-zone clues require draft status before zone changes';
  end if;

  if tg_op = 'UPDATE' then
    return new;
  end if;
  return old;
end;
$$;

create trigger clue_zones_protect_published
before update of clue_id, geojson or delete on public.clue_zones
for each row execute function public.protect_published_clue_children();

alter table public.clue_zones enable row level security;

create policy "collection members can read clue zones"
on public.clue_zones for select
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_zones.clue_id
      and (select public.can_read_collection_clue(clue.collection_id, clue.status))
  )
);

create policy "admins can create clue zones in manageable collections"
on public.clue_zones for insert
to authenticated
with check (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_zones.clue_id
      and (select public.can_administer_collection(clue.collection_id))
  )
);

create policy "admins can update clue zones in manageable collections"
on public.clue_zones for update
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_zones.clue_id
      and (select public.can_administer_collection(clue.collection_id))
  )
)
with check (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_zones.clue_id
      and (select public.can_administer_collection(clue.collection_id))
  )
);

create policy "admins can delete clue zones in manageable collections"
on public.clue_zones for delete
to authenticated
using (
  exists (
    select 1
    from public.clues as clue
    where clue.id = clue_zones.clue_id
      and (select public.can_administer_collection(clue.collection_id))
  )
);
