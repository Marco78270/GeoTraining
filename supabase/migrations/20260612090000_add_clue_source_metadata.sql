alter table public.clues
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists license_name text,
  add column if not exists license_url text,
  add column if not exists attribution_text text;

alter table public.clues
  drop constraint if exists clues_source_name_length;
alter table public.clues
  add constraint clues_source_name_length
  check (source_name is null or char_length(source_name) <= 160);

alter table public.clues
  drop constraint if exists clues_source_url_length;
alter table public.clues
  add constraint clues_source_url_length
  check (source_url is null or char_length(source_url) <= 2000);

alter table public.clues
  drop constraint if exists clues_license_name_length;
alter table public.clues
  add constraint clues_license_name_length
  check (license_name is null or char_length(license_name) <= 160);

alter table public.clues
  drop constraint if exists clues_license_url_length;
alter table public.clues
  add constraint clues_license_url_length
  check (license_url is null or char_length(license_url) <= 2000);

alter table public.clues
  drop constraint if exists clues_attribution_text_length;
alter table public.clues
  add constraint clues_attribution_text_length
  check (attribution_text is null or char_length(attribution_text) <= 2000);
