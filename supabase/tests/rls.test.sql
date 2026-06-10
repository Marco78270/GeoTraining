begin;

create extension if not exists pgtap with schema extensions;

select plan(67);

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

select has_function(
  'public',
  'is_collection_member',
  array['uuid'],
  'membership helper exists'
);
select has_function(
  'public',
  'is_collection_owner',
  array['uuid'],
  'ownership helper exists'
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
  'private clue image bucket has the expected restrictions'
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
  (select count(*)::integer from public.profiles where id in (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003'
  )),
  3,
  'auth user creation creates profiles'
);

insert into public.countries (code, name)
values ('FR', 'France'), ('DE', 'Germany');

insert into public.regions (id, country_code, code, name)
values
  ('20000000-0000-0000-0000-000000000001', 'FR', 'FR-IDF', 'Ile-de-France'),
  ('20000000-0000-0000-0000-000000000002', 'DE', 'DE-BE', 'Berlin');

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

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select results_eq(
  $$ select id from public.collections where id = '30000000-0000-0000-0000-000000000001' $$,
  $$ values ('30000000-0000-0000-0000-000000000001'::uuid) $$,
  'editor can read collection'
);
select lives_ok(
  $$ insert into public.categories (collection_id, name)
     values ('30000000-0000-0000-0000-000000000001', 'Road markings') $$,
  'editor can create category'
);
select lives_ok(
  $$ update public.categories
     set name = 'STOP signs'
     where id = '40000000-0000-0000-0000-000000000001' $$,
  'editor can update category'
);
select lives_ok(
  $$ update public.collections
     set name = 'Editor renamed'
     where id = '30000000-0000-0000-0000-000000000001' $$,
  'unauthorized collection update affects no visible row'
);
select is(
  (
    select name
    from public.collections
    where id = '30000000-0000-0000-0000-000000000001'
  ),
  'Owner collection',
  'editor cannot update collection'
);
select throws_ok(
  $$ insert into public.collection_members (collection_id, user_id, role)
     values (
       '30000000-0000-0000-0000-000000000001',
       '10000000-0000-0000-0000-000000000003',
       'editor'
     ) $$,
  '42501',
  null,
  'editor cannot manage memberships'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

select is(
  (select count(*)::integer from public.collections where id = '30000000-0000-0000-0000-000000000001'),
  0,
  'outsider cannot read collection'
);
select throws_ok(
  $$ insert into public.categories (collection_id, name)
     values ('30000000-0000-0000-0000-000000000001', 'Forbidden') $$,
  '42501',
  null,
  'outsider cannot create category'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values (
       'clue-images',
       '30000000-0000-0000-0000-000000000001/forbidden.webp',
       '10000000-0000-0000-0000-000000000003'
     ) $$,
  '42501',
  null,
  'outsider cannot upload collection image'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values (
       'clue-images',
       '30000000-0000-0000-0000-000000000001/editor.webp',
       '10000000-0000-0000-0000-000000000002'
     ) $$,
  'editor can upload collection image'
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

select lives_ok(
  $$ update public.clues
     set status = 'draft'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  'regional clue can remain draft without region or image'
);
select throws_ok(
  $$ update public.clues
     set status = 'published'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  '23514',
  'published clues require at least one image',
  'publishing without image is rejected'
);

insert into public.clue_images (clue_id, storage_path, sort_order)
values (
  '50000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001/regional.webp',
  0
);

select throws_ok(
  $$ update public.clues
     set status = 'published'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  '23514',
  'published regional clues require at least one region',
  'publishing selected_regions clue without region is rejected'
);
select throws_ok(
  $$ insert into public.clue_regions (clue_id, region_id)
     values (
       '50000000-0000-0000-0000-000000000001',
       '20000000-0000-0000-0000-000000000002'
     ) $$,
  '23514',
  'clue region must belong to the clue country',
  'clue region from another country is rejected'
);
select lives_ok(
  $$ insert into public.clue_regions (clue_id, region_id)
     values (
       '50000000-0000-0000-0000-000000000001',
       '20000000-0000-0000-0000-000000000001'
     ) $$,
  'matching clue region can be added'
);
select lives_ok(
  $$ update public.clues
     set status = 'published'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  'regional clue can publish after image and region exist'
);
select throws_ok(
  $$ update public.clues
     set country_code = 'DE'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  '23514',
  'clue region must belong to the clue country',
  'clue country cannot diverge from existing regions'
);

select throws_ok(
  $$ insert into public.clue_regions (clue_id, region_id)
     values (
       '50000000-0000-0000-0000-000000000001',
       '20000000-0000-0000-0000-000000000002'
     ) $$,
  '23514',
  'clue region must belong to the clue country',
  'published clue still rejects a region from another country'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$ update public.collections
     set owner_id = '10000000-0000-0000-0000-000000000002'
     where id = '30000000-0000-0000-0000-000000000001' $$,
  '23514',
  'collection owner_id is immutable',
  'collection ownership is immutable'
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
  '50000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000002',
  'FR',
  'whole_country',
  'medium',
  'draft',
  'Other collection clue'
);

insert into public.training_sessions (
  id,
  user_id,
  collection_id,
  mode,
  country_code
)
values (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'country',
  'FR'
);

select throws_ok(
  $$ insert into public.training_answers (
       session_id,
       clue_id,
       selected_country_code,
       is_correct
     )
     values (
       '60000000-0000-0000-0000-000000000001',
       '50000000-0000-0000-0000-000000000002',
       'FR',
       false
     ) $$,
  '23514',
  'training answer clue must belong to the session collection',
  'training answer cannot cross collection boundaries'
);

insert into public.training_answers (
  session_id,
  clue_id,
  selected_country_code,
  selected_region_id,
  is_correct
)
values (
  '60000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'FR',
  '20000000-0000-0000-0000-000000000001',
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
select throws_ok(
  $$ insert into public.training_sessions (user_id, collection_id, mode)
     values (
       '10000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000001',
       'world'
     ) $$,
  '42501',
  null,
  'user cannot create a training session for another user'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ update public.collections
     set name = 'Owner renamed'
     where id = '30000000-0000-0000-0000-000000000001' $$,
  'owner can update collection'
);
select lives_ok(
  $$ insert into public.collection_invitations (
       collection_id,
       email,
       role,
       invited_by
     )
     values (
       '30000000-0000-0000-0000-000000000001',
       'new-editor@example.test',
       'editor',
       '10000000-0000-0000-0000-000000000001'
     ) $$,
  'owner can create invitation'
);
select lives_ok(
  $$ delete from public.collection_members
     where collection_id = '30000000-0000-0000-0000-000000000001'
       and user_id = '10000000-0000-0000-0000-000000000002' $$,
  'owner can remove editor'
);

select is(
  (
    select public.is_collection_owner(
      '30000000-0000-0000-0000-000000000001'
    )
  ),
  true,
  'owner helper recognizes owner'
);
select is(
  (
    select public.is_collection_member(
      '30000000-0000-0000-0000-000000000001'
    )
  ),
  true,
  'membership helper recognizes owner membership'
);

select *
from finish();

rollback;
