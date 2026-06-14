insert into public.collections (
  id,
  owner_id,
  name,
  description,
  visibility
)
values (
  'b0000000-0000-0000-0000-000000000001',
  null,
  'Bollards',
  'Collection officielle commune en lecture seule pour s''entraîner sur les bollards GeoGuessr.',
  'public_readonly'
)
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  visibility = excluded.visibility;

insert into public.categories (
  id,
  collection_id,
  name,
  icon,
  color
)
values (
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'Bollards',
  'traffic-cone',
  '#20D4E6'
)
on conflict (id) do update
set
  name = excluded.name,
  icon = excluded.icon,
  color = excluded.color;
