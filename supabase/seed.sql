insert into public.countries (code, name)
values
  ('AU', 'Australia'),
  ('BR', 'Brazil'),
  ('CA', 'Canada'),
  ('DE', 'Germany'),
  ('ES', 'Spain'),
  ('FR', 'France'),
  ('GB', 'United Kingdom'),
  ('IN', 'India'),
  ('JP', 'Japan'),
  ('US', 'United States')
on conflict (code) do update
set name = excluded.name;

insert into public.regions (country_code, code, name)
values
  ('FR', 'FR-ARA', 'Auvergne-Rhone-Alpes'),
  ('FR', 'FR-BFC', 'Bourgogne-Franche-Comte'),
  ('FR', 'FR-BRE', 'Bretagne'),
  ('FR', 'FR-CVL', 'Centre-Val de Loire'),
  ('FR', 'FR-COR', 'Corse'),
  ('FR', 'FR-GES', 'Grand Est'),
  ('FR', 'FR-HDF', 'Hauts-de-France'),
  ('FR', 'FR-IDF', 'Ile-de-France'),
  ('FR', 'FR-NOR', 'Normandie'),
  ('FR', 'FR-NAQ', 'Nouvelle-Aquitaine'),
  ('FR', 'FR-OCC', 'Occitanie'),
  ('FR', 'FR-PDL', 'Pays de la Loire'),
  ('FR', 'FR-PAC', 'Provence-Alpes-Cote d''Azur')
on conflict (country_code, code) do update
set name = excluded.name;
