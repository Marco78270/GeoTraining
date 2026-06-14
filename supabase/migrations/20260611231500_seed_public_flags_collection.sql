insert into public.collections (
  id,
  owner_id,
  name,
  description,
  visibility
)
values (
  'f0000000-0000-0000-0000-000000000001',
  null,
  'Collection officielle',
  'Collection officielle commune en lecture seule pour s''entraîner sur les drapeaux des pays.',
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
  'f1000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001',
  'Drapeaux',
  'flag',
  '#20D4E6'
)
on conflict (id) do update
set
  name = excluded.name,
  icon = excluded.icon,
  color = excluded.color;
