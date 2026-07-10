insert into public.countries (code, name, geojson_path)
values ('CW', U&'Cura\00E7ao', '/geography/world.geojson')
on conflict (code) do update
set name = excluded.name,
    geojson_path = excluded.geojson_path;

insert into public.regions (id, country_code, name, geojson_path)
values ('CW-CW', 'CW', U&'Cura\00E7ao', '/geography/regions/CW.geojson')
on conflict (id) do update
set country_code = excluded.country_code,
    name = excluded.name,
    geojson_path = excluded.geojson_path;
