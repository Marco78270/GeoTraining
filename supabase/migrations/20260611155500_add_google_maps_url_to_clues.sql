alter table public.clues
  add column if not exists google_maps_url text;

alter table public.clues
  drop constraint if exists clues_google_maps_url_length;

alter table public.clues
  add constraint clues_google_maps_url_length
  check (
    google_maps_url is null
    or char_length(google_maps_url) <= 2000
  );
