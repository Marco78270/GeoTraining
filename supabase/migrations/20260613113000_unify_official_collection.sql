update public.collections
set
  name = 'Collection officielle',
  description = 'Collection officielle commune en lecture seule pour s''entraîner sur les indices GeoGuessr validés par la plateforme.'
where id = 'f0000000-0000-0000-0000-000000000001';

insert into public.categories (
  id,
  collection_id,
  name,
  icon,
  color
)
values (
  'f1000000-0000-0000-0000-000000000002',
  'f0000000-0000-0000-0000-000000000001',
  'Bollards',
  'traffic-cone',
  '#20D4E6'
)
on conflict (id) do update
set
  name = excluded.name,
  icon = excluded.icon,
  color = excluded.color;
