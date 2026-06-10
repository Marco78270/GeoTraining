insert into public.countries (code, name, geojson_path)
values
  ('AU', 'Australia', '/geography/countries/AU.geojson'),
  ('BR', 'Brazil', '/geography/countries/BR.geojson'),
  ('CA', 'Canada', '/geography/countries/CA.geojson'),
  ('DE', 'Germany', '/geography/countries/DE.geojson'),
  ('ES', 'Spain', '/geography/countries/ES.geojson'),
  ('FR', 'France', '/geography/countries/FR.geojson'),
  ('GB', 'United Kingdom', '/geography/countries/GB.geojson'),
  ('IN', 'India', '/geography/countries/IN.geojson'),
  ('JP', 'Japan', '/geography/countries/JP.geojson'),
  ('US', 'United States', '/geography/countries/US.geojson')
on conflict (code) do update
set
  name = excluded.name,
  geojson_path = excluded.geojson_path;

insert into public.regions (id, country_code, name, geojson_path)
values
  ('FR-ARA', 'FR', 'Auvergne-Rhone-Alpes', '/geography/regions/FR-ARA.geojson'),
  ('FR-BFC', 'FR', 'Bourgogne-Franche-Comte', '/geography/regions/FR-BFC.geojson'),
  ('FR-BRE', 'FR', 'Bretagne', '/geography/regions/FR-BRE.geojson'),
  ('FR-CVL', 'FR', 'Centre-Val de Loire', '/geography/regions/FR-CVL.geojson'),
  ('FR-COR', 'FR', 'Corse', '/geography/regions/FR-COR.geojson'),
  ('FR-GES', 'FR', 'Grand Est', '/geography/regions/FR-GES.geojson'),
  ('FR-HDF', 'FR', 'Hauts-de-France', '/geography/regions/FR-HDF.geojson'),
  ('FR-IDF', 'FR', 'Ile-de-France', '/geography/regions/FR-IDF.geojson'),
  ('FR-NOR', 'FR', 'Normandie', '/geography/regions/FR-NOR.geojson'),
  ('FR-NAQ', 'FR', 'Nouvelle-Aquitaine', '/geography/regions/FR-NAQ.geojson'),
  ('FR-OCC', 'FR', 'Occitanie', '/geography/regions/FR-OCC.geojson'),
  ('FR-PDL', 'FR', 'Pays de la Loire', '/geography/regions/FR-PDL.geojson'),
  ('FR-PAC', 'FR', 'Provence-Alpes-Cote d''Azur', '/geography/regions/FR-PAC.geojson')
on conflict (id) do update
set
  country_code = excluded.country_code,
  name = excluded.name,
  geojson_path = excluded.geojson_path;
