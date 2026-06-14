insert into public.categories (id, collection_id, name, icon, color)
values
  (
    'f1000000-0000-0000-0000-000000000004',
    'f0000000-0000-0000-0000-000000000001',
    'Marquages au sol',
    'road',
    '#F2C94C'
  ),
  (
    'f1000000-0000-0000-0000-000000000005',
    'f0000000-0000-0000-0000-000000000001',
    'Poteaux électriques',
    'pole',
    '#A78BFA'
  ),
  (
    'f1000000-0000-0000-0000-000000000006',
    'f0000000-0000-0000-0000-000000000001',
    'Google Car',
    'car',
    '#38BDF8'
  )
on conflict (id) do update
set
  collection_id = excluded.collection_id,
  name = excluded.name,
  icon = excluded.icon,
  color = excluded.color;
