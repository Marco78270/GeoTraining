begin;

create extension if not exists pgtap with schema extensions;

select plan(128);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'collections', 'collections table exists');
select has_table('public', 'collection_members', 'collection_members table exists');
select has_table('public', 'collection_invitations', 'collection_invitations table exists');
select has_table('public', 'categories', 'categories table exists');
select has_table('public', 'countries', 'countries table exists');
select has_table('public', 'regions', 'regions table exists');
select has_table('public', 'clues', 'clues table exists');
select has_table('public', 'clue_regions', 'clue_regions table exists');
select has_table('public', 'clue_images', 'clue_images table exists');
select has_table('public', 'training_sessions', 'training_sessions table exists');
select has_table('public', 'training_answers', 'training_answers table exists');

select has_type('public', 'collection_role', 'collection_role enum exists');
select has_type('public', 'coverage_mode', 'coverage_mode enum exists');
select has_type('public', 'clue_difficulty', 'clue_difficulty enum exists');
select has_type('public', 'invitation_status', 'invitation_status enum exists');
select has_type('public', 'training_mode', 'training_mode enum exists');
select has_type('public', 'clue_status', 'clue_status enum exists');

select has_column('public', 'collection_invitations', 'token_hash', 'invitation token hash exists');
select col_type_is('public', 'collection_invitations', 'token_hash', 'text', 'token hash is text');
select col_not_null('public', 'collection_invitations', 'token_hash', 'token hash is required');
select has_column('public', 'countries', 'geojson_path', 'country GeoJSON path exists');
select col_type_is('public', 'countries', 'geojson_path', 'text', 'country GeoJSON path is text');
select col_not_null('public', 'countries', 'geojson_path', 'country GeoJSON path is required');
select col_type_is('public', 'regions', 'id', 'text', 'region id is text');
select col_is_pk('public', 'regions', 'id', 'region id is primary key');
select has_column('public', 'regions', 'geojson_path', 'region GeoJSON path exists');
select col_not_null('public', 'regions', 'geojson_path', 'region GeoJSON path is required');
select has_column('public', 'training_sessions', 'total_questions', 'session question count exists');
select col_type_is('public', 'training_sessions', 'total_questions', 'integer', 'question count is integer');
select has_column('public', 'training_answers', 'selected_code', 'selected answer code exists');
select col_type_is('public', 'training_answers', 'selected_code', 'text', 'selected answer code is text');
select has_column('public', 'clues', 'author_id', 'clue author id exists');
select hasnt_column('public', 'clues', 'created_by', 'legacy clue creator column is absent');
select has_column('public', 'training_answers', 'correct_code', 'correct answer code exists');
select col_type_is('public', 'training_answers', 'correct_code', 'text', 'correct answer code is text');
select hasnt_column(
  'public',
  'training_answers',
  'selected_country_code',
  'legacy selected country column is absent'
);
select hasnt_column(
  'public',
  'training_answers',
  'selected_region_id',
  'legacy selected region column is absent'
);
select hasnt_column('public', 'regions', 'code', 'legacy region code column is absent');

select has_function('public', 'is_collection_member', array['uuid'], 'membership helper exists');
select has_function('public', 'is_collection_owner', array['uuid'], 'ownership helper exists');
select has_function(
  'public',
  'can_access_clue_image_object',
  array['text'],
  'storage path authorization helper exists'
);
select has_function(
  'public',
  'can_manage_clue_image_object',
  array['text'],
  'storage write authorization helper exists'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.is_collection_member(uuid)'::regprocedure
  ),
  array['search_path=""'],
  'membership helper has an empty search_path'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.is_collection_owner(uuid)'::regprocedure
  ),
  array['search_path=""'],
  'owner helper has an empty search_path'
);
select is(
  has_function_privilege('authenticated', 'public.is_collection_member(uuid)', 'execute'),
  true,
  'authenticated can execute membership helper'
);
select is(
  has_function_privilege('anon', 'public.is_collection_member(uuid)', 'execute'),
  false,
  'anon cannot execute membership helper'
);
select is(
  has_function_privilege('authenticated', 'public.can_access_clue_image_object(text)', 'execute'),
  true,
  'authenticated can execute the narrow storage authorization helper'
);
select is(
  has_function_privilege('anon', 'public.can_access_clue_image_object(text)', 'execute'),
  false,
  'anon cannot execute the storage authorization helper'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.can_access_clue_image_object(text)'::regprocedure
  ),
  array['search_path=""'],
  'storage authorization helper has an empty search_path'
);
select is(
  has_function_privilege('authenticated', 'public.can_manage_clue_image_object(text)', 'execute'),
  true,
  'authenticated can execute the narrow storage write helper'
);
select is(
  has_function_privilege('anon', 'public.can_manage_clue_image_object(text)', 'execute'),
  false,
  'anon cannot execute the storage write helper'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.can_manage_clue_image_object(text)'::regprocedure
  ),
  array['search_path=""'],
  'storage write helper has an empty search_path'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.validate_published_clue_image_insert()',
    'execute'
  ),
  false,
  'published-image integrity trigger function is not directly executable'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.validate_published_clue_image_insert()'::regprocedure
  ),
  array['search_path=""'],
  'published-image integrity trigger has an empty search_path'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.protect_published_clue_storage_object()',
    'execute'
  ),
  false,
  'storage integrity trigger function is not directly executable'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.protect_published_clue_storage_object()'::regprocedure
  ),
  array['search_path=""'],
  'storage integrity trigger has an empty search_path'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.has_stored_clue_image(uuid)',
    'execute'
  ),
  false,
  'stored-image verification helper is not directly executable'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.has_stored_clue_image(uuid)'::regprocedure
  ),
  array['search_path=""'],
  'stored-image verification helper has an empty search_path'
);

select policies_are(
  'public',
  'collections',
  array[
    'collection members can read',
    'users can create collections',
    'owners can update collections',
    'owners can delete collections'
  ],
  'collection policies are complete'
);
select policies_are(
  'public',
  'collection_members',
  array[
    'collection members can read memberships',
    'owners can add memberships',
    'owners can update memberships',
    'owners can delete memberships'
  ],
  'membership policies are complete'
);
select policies_are(
  'public',
  'collection_invitations',
  array[
    'collection members can read invitations',
    'owners can create invitations',
    'owners can update invitations',
    'owners can delete invitations'
  ],
  'invitation policies are complete'
);
select policies_are(
  'public',
  'categories',
  array[
    'collection members can read categories',
    'collection members can create categories',
    'collection members can update categories',
    'collection members can delete categories'
  ],
  'category policies are complete'
);
select policies_are(
  'public',
  'clues',
  array[
    'collection members can read clues',
    'collection members can create clues',
    'collection members can update clues',
    'collection members can delete clues'
  ],
  'clue policies are complete'
);
select policies_are(
  'public',
  'clue_regions',
  array[
    'collection members can read clue regions',
    'collection members can create clue regions',
    'collection members can update clue regions',
    'collection members can delete clue regions'
  ],
  'clue region policies are complete'
);
select policies_are(
  'public',
  'clue_images',
  array[
    'collection members can read clue images',
    'collection members can create clue images',
    'collection members can update clue images',
    'collection members can delete clue images'
  ],
  'clue image policies are complete'
);
select policies_are(
  'public',
  'training_sessions',
  array[
    'users can read own training sessions',
    'users can create own training sessions',
    'users can update own training sessions',
    'users can delete own training sessions'
  ],
  'training session policies are complete'
);
select policies_are(
  'public',
  'training_answers',
  array[
    'users can read own training answers',
    'users can create own training answers',
    'users can update own training answers',
    'users can delete own training answers'
  ],
  'training answer policies are complete'
);
select policies_are(
  'storage',
  'objects',
  array[
    'collection members can read clue images',
    'collection members can upload clue images',
    'collection members can update clue images',
    'collection members can delete clue images'
  ],
  'storage policies are complete'
);

select row_security_active('public', 'collections', 'collections RLS is enabled');
select row_security_active('public', 'collection_members', 'memberships RLS is enabled');
select row_security_active('public', 'categories', 'categories RLS is enabled');
select row_security_active('public', 'clues', 'clues RLS is enabled');
select row_security_active('public', 'training_sessions', 'training sessions RLS is enabled');
select row_security_active('public', 'training_answers', 'training answers RLS is enabled');
select is(
  (
    select count(*)::integer
    from storage.buckets
    where id = 'clue-images'
      and public = false
      and file_size_limit = 10485760
      and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  ),
  1,
  'private clue image bucket restricts size and MIME types'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'owner@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'editor@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"Editor"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'outsider@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"Outsider"}'::jsonb,
    now(),
    now()
  );

select is(
  (
    select count(*)::integer
    from public.profiles
    where id in (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000003'
    )
  ),
  3,
  'auth user creation creates profiles'
);

insert into public.countries (code, name, geojson_path)
values
  ('FR', 'France', '/geography/countries/FR.geojson'),
  ('DE', 'Germany', '/geography/countries/DE.geojson');

insert into public.regions (id, country_code, name, geojson_path)
values
  ('FR-IDF', 'FR', 'Ile-de-France', '/geography/regions/FR-IDF.geojson'),
  ('DE-BE', 'DE', 'Berlin', '/geography/regions/DE-BE.geojson');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into public.collections (id, owner_id, name)
values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Owner collection'
);

select is(
  (
    select role::text
    from public.collection_members
    where collection_id = '30000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000001'
  ),
  'owner',
  'collection creation adds owner membership'
);
select lives_ok(
  $$ update public.collection_members
     set role = 'editor'
     where collection_id = '30000000-0000-0000-0000-000000000001'
       and user_id = '10000000-0000-0000-0000-000000000001' $$,
  'owner membership update is filtered by RLS'
);
select is(
  (
    select role::text
    from public.collection_members
    where collection_id = '30000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000001'
  ),
  'owner',
  'owner membership cannot be modified'
);
select lives_ok(
  $$ delete from public.collection_members
     where collection_id = '30000000-0000-0000-0000-000000000001'
       and user_id = '10000000-0000-0000-0000-000000000001' $$,
  'owner membership delete is filtered by RLS'
);
select is(
  (
    select count(*)::integer
    from public.collection_members
    where collection_id = '30000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000001'
  ),
  1,
  'owner membership cannot be deleted'
);

insert into public.collection_members (collection_id, user_id, role)
values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'editor'
);

insert into public.categories (id, collection_id, name)
values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Stop signs'
);

select lives_ok(
  $$ update public.categories
     set name = 'STOP signs'
     where id = '40000000-0000-0000-0000-000000000001' $$,
  'category can be updated'
);
select is(
  (
    select updated_at > created_at
    from public.categories
    where id = '40000000-0000-0000-0000-000000000001'
  ),
  true,
  'updated_at advances on update'
);

insert into public.collections (id, owner_id, name)
values (
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'Second collection'
);

insert into public.categories (id, collection_id, name)
values (
  '40000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  'Second category'
);

select throws_ok(
  $$ insert into public.clues (
       collection_id,
       category_id,
       country_code,
       title
     )
     values (
       '30000000-0000-0000-0000-000000000001',
       '40000000-0000-0000-0000-000000000002',
       'FR',
       'Wrong category'
     ) $$,
  '23503',
  null,
  'clue category must belong to the same collection'
);

insert into public.clues (
  id,
  collection_id,
  category_id,
  country_code,
  coverage,
  difficulty,
  status,
  title
)
values (
  '50000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'FR',
  'selected_regions',
  'easy',
  'draft',
  'Regional clue'
);

select throws_ok(
  $$ update public.clues
     set collection_id = '30000000-0000-0000-0000-000000000002'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  '23514',
  'clue collection_id is immutable',
  'clue cannot move between collections'
);

select throws_ok(
  $$ insert into public.clue_regions (clue_id, region_id)
     values ('50000000-0000-0000-0000-000000000001', 'DE-BE') $$,
  '23514',
  'clue region must belong to the clue country',
  'region must belong to clue country'
);
select lives_ok(
  $$ insert into public.clue_regions (clue_id, region_id)
     values ('50000000-0000-0000-0000-000000000001', 'FR-IDF') $$,
  'matching clue region can be added'
);
select throws_ok(
  $$ update public.clues
     set country_code = 'DE'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  '23514',
  'clue category_id and country_code are immutable after children exist',
  'country cannot change after child creation'
);
select throws_ok(
  $$ update public.clues
     set category_id = '40000000-0000-0000-0000-000000000002'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  '23514',
  'clue category_id and country_code are immutable after children exist',
  'category cannot change after child creation'
);

select throws_ok(
  $$ update public.clues
     set status = 'published'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  '23514',
  'published clues require at least one stored image',
  'publishing without stored image is rejected'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values (
       'clue-images',
       '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.webp',
       '10000000-0000-0000-0000-000000000003'
     ) $$,
  '42501',
  null,
  'outsider cannot upload a valid collection path'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values (
       'clue-images',
       '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/not-a-uuid.webp',
       '10000000-0000-0000-0000-000000000002'
     ) $$,
  '42501',
  null,
  'storage rejects non-UUID image segment'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values (
       'clue-images',
       '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.gif',
       '10000000-0000-0000-0000-000000000002'
     ) $$,
  '42501',
  null,
  'storage rejects unsupported extension'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values (
       'clue-images',
       '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-00000000000A.webp',
       '10000000-0000-0000-0000-000000000002'
     ) $$,
  '42501',
  null,
  'storage rejects non-canonical uppercase UUID paths'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values (
       'clue-images',
       '30000000-0000-0000-0000-000000000002/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.webp',
       '10000000-0000-0000-0000-000000000002'
     ) $$,
  '42501',
  null,
  'storage rejects collection and clue mismatch'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values (
       'clue-images',
       '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.webp/extra',
       '10000000-0000-0000-0000-000000000002'
     ) $$,
  '42501',
  null,
  'storage rejects extra path segments'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values (
       'clue-images',
       '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.webp',
       '10000000-0000-0000-0000-000000000002'
     ) $$,
  'editor can upload a strict valid path'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'clue-images'
  ),
  0,
  'outsider cannot read a valid stored image path'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select throws_ok(
  $$ insert into public.clue_images (id, clue_id, storage_path)
     values (
       '70000000-0000-0000-0000-000000000002',
       '50000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.webp'
     ) $$,
  '23514',
  'clue image path must match collection, clue, image id, and extension',
  'metadata rejects path with another image id'
);
select throws_ok(
  $$ insert into public.clue_images (id, clue_id, storage_path)
     values (
       '70000000-0000-0000-0000-000000000001',
       '50000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.gif'
     ) $$,
  '23514',
  'clue image path must match collection, clue, image id, and extension',
  'metadata rejects unsupported extension'
);
select lives_ok(
  $$ insert into public.clue_images (id, clue_id, storage_path)
     values (
       '70000000-0000-0000-0000-000000000001',
       '50000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.webp'
     ) $$,
  'metadata accepts exact strict path'
);
select lives_ok(
  $$ update public.clues
     set status = 'published'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  'clue publishes after matching object, metadata, and region exist'
);
select throws_ok(
  $$ insert into public.clue_images (id, clue_id, storage_path, sort_order)
     values (
       '70000000-0000-0000-0000-000000000002',
       '50000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000002.webp',
       1
     ) $$,
  '23514',
  'published clue image metadata requires its stored object',
  'published clue rejects image metadata without a matching stored object'
);
select lives_ok(
  $$ insert into storage.objects (id, bucket_id, name, owner_id, metadata)
     values (
       '80000000-0000-0000-0000-000000000002',
       'clue-images',
       '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000002.webp',
       '10000000-0000-0000-0000-000000000001',
       '{"mimetype":"image/webp","size":2048}'::jsonb
     ) $$,
  'collection member can upload a second object for a published clue'
);
select lives_ok(
  $$ insert into public.clue_images (id, clue_id, storage_path)
     values (
       '70000000-0000-0000-0000-000000000002',
       '50000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000002.webp'
     ) $$,
  'published clue accepts metadata after its matching object exists'
);
select is(
  public.can_access_clue_image_object(
    '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.webp'
  ),
  true,
  'published storage helper accepts exact metadata image id'
);
select is(
  public.can_access_clue_image_object(
    '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000002.webp'
  ),
  true,
  'published storage helper accepts the newly linked image'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'clue-images'
      and name = '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.webp'
  ),
  1,
  'editor can read published object through the strict path policy'
);
select lives_ok(
  $$ delete from public.clue_images
     where id = '70000000-0000-0000-0000-000000000002' $$,
  'a non-final published image metadata row can be removed'
);
select lives_ok(
  $$ delete from storage.objects
     where bucket_id = 'clue-images'
       and name = '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000002.webp' $$,
  'an unlinked published-clue object can be cleaned up'
);

select throws_ok(
  $$ delete from public.clue_images
     where id = '70000000-0000-0000-0000-000000000001' $$,
  '23514',
  'published clues require at least one image metadata row',
  'last published image metadata cannot be deleted'
);
select throws_ok(
  $$ update public.clue_images
     set storage_path = '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.png'
     where id = '70000000-0000-0000-0000-000000000001' $$,
  '23514',
  'published clue images require draft status before path changes',
  'published metadata path cannot be changed'
);
select throws_ok(
  $$ delete from storage.objects
     where bucket_id = 'clue-images'
       and name = '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.webp' $$,
  '23514',
  'published clues require their stored image objects',
  'published storage object cannot be deleted'
);
select throws_ok(
  $$ update storage.objects
     set name = '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.png'
     where bucket_id = 'clue-images'
       and name = '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.webp' $$,
  '23514',
  'published clues require draft status before storage changes',
  'published storage object cannot be renamed'
);
select throws_ok(
  $$ delete from public.clue_regions
     where clue_id = '50000000-0000-0000-0000-000000000001'
       and region_id = 'FR-IDF' $$,
  '23514',
  'published regional clues require at least one region',
  'last published region cannot be deleted'
);
select throws_ok(
  $$ update public.clues
     set category_id = '40000000-0000-0000-0000-000000000002'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  '23514',
  'published clue category_id and country_code are immutable',
  'published clue category cannot change'
);

select lives_ok(
  $$ update public.clues
     set status = 'draft'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  'published clue can explicitly return to draft'
);
select lives_ok(
  $$ delete from storage.objects
     where bucket_id = 'clue-images'
       and name = '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.webp' $$,
  'draft clue storage object can be deleted'
);
select throws_ok(
  $$ update public.clues
     set status = 'published'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  '23514',
  'published clues require at least one stored image',
  'metadata without real storage object cannot publish'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$ insert into public.collection_invitations (
       collection_id,
       email,
       role,
       invited_by,
       token_hash
     )
     values (
       '30000000-0000-0000-0000-000000000001',
       'missing-token@example.test',
       'editor',
       '10000000-0000-0000-0000-000000000001',
       null
     ) $$,
  '23502',
  null,
  'invitation requires a token hash'
);
select lives_ok(
  $$ insert into public.collection_invitations (
       collection_id,
       email,
       role,
       invited_by,
       token_hash
     )
     values (
       '30000000-0000-0000-0000-000000000001',
       'new-editor@example.test',
       'editor',
       '10000000-0000-0000-0000-000000000001',
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
     ) $$,
  'owner can create invitation with token hash'
);
select throws_ok(
  $$ insert into public.collection_invitations (
       collection_id,
       email,
       role,
       invited_by,
       token_hash
     )
     values (
       '30000000-0000-0000-0000-000000000002',
       'another-editor@example.test',
       'editor',
       '10000000-0000-0000-0000-000000000001',
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
     ) $$,
  '23505',
  null,
  'invitation token hashes are unique'
);

insert into public.training_sessions (
  id,
  user_id,
  collection_id,
  mode,
  country_code,
  total_questions
)
values (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'country',
  'FR',
  10
);

insert into public.training_answers (
  session_id,
  clue_id,
  selected_code,
  correct_code,
  is_correct
)
values (
  '60000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'FR-IDF',
  'FR-IDF',
  true
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::integer from public.training_sessions),
  0,
  'another user cannot read private training sessions'
);
select is(
  (select count(*)::integer from public.training_answers),
  0,
  'another user cannot read private training answers'
);
select is(
  (
    select public.is_collection_member(
      '30000000-0000-0000-0000-000000000001'
    )
  ),
  true,
  'membership helper recognizes editor'
);
select is(
  (
    select public.is_collection_owner(
      '30000000-0000-0000-0000-000000000001'
    )
  ),
  false,
  'owner helper rejects editor'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is(
  (
    select public.is_collection_member(
      '30000000-0000-0000-0000-000000000001'
    )
  ),
  false,
  'membership helper rejects outsider'
);

select *
from finish();

rollback;
