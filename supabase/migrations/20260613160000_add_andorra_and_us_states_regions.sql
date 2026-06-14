insert into public.countries (code, name, geojson_path)
values
  ('AD', 'Andorra', '/geography/world.geojson')
on conflict (code) do update
set
  name = excluded.name,
  geojson_path = excluded.geojson_path;

insert into public.regions (id, country_code, name, geojson_path)
values
  ('US-AK', 'US', 'Alaska', '/geography/regions/US.geojson'),
  ('US-AL', 'US', 'Alabama', '/geography/regions/US.geojson'),
  ('US-AR', 'US', 'Arkansas', '/geography/regions/US.geojson'),
  ('US-AZ', 'US', 'Arizona', '/geography/regions/US.geojson'),
  ('US-CA', 'US', 'California', '/geography/regions/US.geojson'),
  ('US-CO', 'US', 'Colorado', '/geography/regions/US.geojson'),
  ('US-CT', 'US', 'Connecticut', '/geography/regions/US.geojson'),
  ('US-DE', 'US', 'Delaware', '/geography/regions/US.geojson'),
  ('US-FL', 'US', 'Florida', '/geography/regions/US.geojson'),
  ('US-GA', 'US', 'Georgia', '/geography/regions/US.geojson'),
  ('US-HI', 'US', 'Hawaii', '/geography/regions/US.geojson'),
  ('US-IA', 'US', 'Iowa', '/geography/regions/US.geojson'),
  ('US-ID', 'US', 'Idaho', '/geography/regions/US.geojson'),
  ('US-IL', 'US', 'Illinois', '/geography/regions/US.geojson'),
  ('US-IN', 'US', 'Indiana', '/geography/regions/US.geojson'),
  ('US-KS', 'US', 'Kansas', '/geography/regions/US.geojson'),
  ('US-KY', 'US', 'Kentucky', '/geography/regions/US.geojson'),
  ('US-LA', 'US', 'Louisiana', '/geography/regions/US.geojson'),
  ('US-MA', 'US', 'Massachusetts', '/geography/regions/US.geojson'),
  ('US-MD', 'US', 'Maryland', '/geography/regions/US.geojson'),
  ('US-ME', 'US', 'Maine', '/geography/regions/US.geojson'),
  ('US-MI', 'US', 'Michigan', '/geography/regions/US.geojson'),
  ('US-MN', 'US', 'Minnesota', '/geography/regions/US.geojson'),
  ('US-MO', 'US', 'Missouri', '/geography/regions/US.geojson'),
  ('US-MS', 'US', 'Mississippi', '/geography/regions/US.geojson'),
  ('US-MT', 'US', 'Montana', '/geography/regions/US.geojson'),
  ('US-NC', 'US', 'North Carolina', '/geography/regions/US.geojson'),
  ('US-ND', 'US', 'North Dakota', '/geography/regions/US.geojson'),
  ('US-NE', 'US', 'Nebraska', '/geography/regions/US.geojson'),
  ('US-NH', 'US', 'New Hampshire', '/geography/regions/US.geojson'),
  ('US-NJ', 'US', 'New Jersey', '/geography/regions/US.geojson'),
  ('US-NM', 'US', 'New Mexico', '/geography/regions/US.geojson'),
  ('US-NV', 'US', 'Nevada', '/geography/regions/US.geojson'),
  ('US-NY', 'US', 'New York', '/geography/regions/US.geojson'),
  ('US-OH', 'US', 'Ohio', '/geography/regions/US.geojson'),
  ('US-OK', 'US', 'Oklahoma', '/geography/regions/US.geojson'),
  ('US-OR', 'US', 'Oregon', '/geography/regions/US.geojson'),
  ('US-PA', 'US', 'Pennsylvania', '/geography/regions/US.geojson'),
  ('US-RI', 'US', 'Rhode Island', '/geography/regions/US.geojson'),
  ('US-SC', 'US', 'South Carolina', '/geography/regions/US.geojson'),
  ('US-SD', 'US', 'South Dakota', '/geography/regions/US.geojson'),
  ('US-TN', 'US', 'Tennessee', '/geography/regions/US.geojson'),
  ('US-TX', 'US', 'Texas', '/geography/regions/US.geojson'),
  ('US-UT', 'US', 'Utah', '/geography/regions/US.geojson'),
  ('US-VA', 'US', 'Virginia', '/geography/regions/US.geojson'),
  ('US-VT', 'US', 'Vermont', '/geography/regions/US.geojson'),
  ('US-WA', 'US', 'Washington', '/geography/regions/US.geojson'),
  ('US-WI', 'US', 'Wisconsin', '/geography/regions/US.geojson'),
  ('US-WV', 'US', 'West Virginia', '/geography/regions/US.geojson'),
  ('US-WY', 'US', 'Wyoming', '/geography/regions/US.geojson')
on conflict (id) do update
set
  country_code = excluded.country_code,
  name = excluded.name,
  geojson_path = excluded.geojson_path;
