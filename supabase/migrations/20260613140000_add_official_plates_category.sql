insert into public.categories (
  id,
  collection_id,
  name,
  icon,
  color
)
values (
  'f1000000-0000-0000-0000-000000000003',
  'f0000000-0000-0000-0000-000000000001',
  'Plaques',
  'rectangle-horizontal',
  '#7AA2FF'
)
on conflict (id) do update
set
  name = excluded.name,
  icon = excluded.icon,
  color = excluded.color;
