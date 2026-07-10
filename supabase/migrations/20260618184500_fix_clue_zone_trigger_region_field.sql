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

  if target_status <> 'published' then
    if tg_op = 'UPDATE' then
      return new;
    end if;
    return old;
  end if;

  if tg_table_name = 'clue_images' then
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

  if tg_table_name = 'clue_regions' and target_coverage = 'selected_regions' then
    if not exists (
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
  end if;

  if tg_table_name = 'clue_zones' and target_coverage = 'drawn_zone' then
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
