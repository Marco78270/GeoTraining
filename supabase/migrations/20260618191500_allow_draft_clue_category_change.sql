create or replace function public.protect_clue_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.collection_id is distinct from old.collection_id then
    raise exception using
      errcode = '23514',
      message = 'clue collection_id is immutable';
  end if;

  if new.author_id is distinct from old.author_id then
    raise exception using
      errcode = '23514',
      message = 'clue author_id is immutable';
  end if;

  if new.country_code is distinct from old.country_code then
    if old.status = 'published'
      or new.status = 'published'
      or exists (
        select 1
        from public.clue_regions
        where clue_id = old.id
      )
      or exists (
        select 1
        from public.clue_zones
        where clue_id = old.id
      )
      or exists (
        select 1
        from public.clue_images
        where clue_id = old.id
      )
    then
      raise exception using
        errcode = '23514',
        message = 'clue country_code is immutable after publication or children exist';
    end if;
  end if;

  if new.category_id is distinct from old.category_id
    and (old.status = 'published' or new.status = 'published')
  then
    raise exception using
      errcode = '23514',
      message = 'published clue category_id is immutable until draft status';
  end if;

  return new;
end;
$$;
