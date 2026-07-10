begin;

create extension if not exists pgtap with schema extensions;

select plan(307);

select has_table('public', 'profiles', 'profiles table exists');
select has_column(
  'public',
  'profiles',
  'username_changed_at',
  'profile username change timestamp exists'
);
select has_column(
  'public',
  'profiles',
  'leaderboard_visible',
  'profile leaderboard visibility exists'
);
select col_not_null(
  'public',
  'profiles',
  'leaderboard_visible',
  'leaderboard visibility is required'
);
select is(
  (
    select pg_get_expr(defaults.adbin, defaults.adrelid)
    from pg_catalog.pg_attrdef as defaults
    join pg_catalog.pg_attribute as attributes
      on attributes.attrelid = defaults.adrelid
     and attributes.attnum = defaults.adnum
    where defaults.adrelid = 'public.profiles'::regclass
      and attributes.attname = 'leaderboard_visible'
  ),
  'true',
  'leaderboard visibility defaults to true'
);
select has_index(
  'public',
  'profiles',
  'profiles_display_name_unique_idx',
  'profile usernames have a case-insensitive index'
);
select index_is_unique(
  'public',
  'profiles',
  'profiles_display_name_unique_idx',
  'profile usernames are unique case-insensitively'
);
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
select has_column('public', 'collections', 'is_official', 'official collection marker exists');
select col_not_null(
  'public',
  'collections',
  'is_official',
  'official collection marker is required'
);
select has_index(
  'public',
  'collections',
  'collections_single_official_idx',
  'single official collection partial index exists'
);
select index_is_unique(
  'public',
  'collections',
  'collections_single_official_idx',
  'single official collection partial index is unique'
);
select has_column('public', 'training_sessions', 'is_ranked', 'ranked session marker exists');
select col_not_null(
  'public',
  'training_sessions',
  'is_ranked',
  'ranked session marker is required'
);
select has_column('public', 'training_sessions', 'duration_ms', 'session duration exists');
select col_type_is(
  'public',
  'training_sessions',
  'duration_ms',
  'bigint',
  'session duration is stored in milliseconds'
);
select has_column('public', 'profiles', 'xp_total', 'profile xp total exists');
select col_not_null(
  'public',
  'profiles',
  'xp_total',
  'profile xp total is required'
);
select col_default_is(
  'public',
  'profiles',
  'xp_total',
  '0',
  'profile xp total defaults to zero'
);
select has_table('public', 'daily_challenges', 'daily challenges table exists');
select has_table('public', 'daily_challenge_items', 'daily challenge items table exists');
select has_table('public', 'daily_challenge_attempts', 'daily challenge attempts table exists');
select has_table('public', 'daily_attempt_steps', 'daily attempt steps table exists');
select has_table('public', 'xp_events', 'xp events table exists');
select has_column(
  'public',
  'xp_events',
  'training_session_id',
  'xp events track training sessions'
);
select col_is_pk('public', 'xp_events', 'id', 'xp events use a primary key');
select has_index(
  'public',
  'xp_events',
  'xp_events_training_session_id_key',
  'xp events keep a named uniqueness backstop for training sessions'
);
select index_is_unique(
  'public',
  'xp_events',
  'xp_events_training_session_id_key',
  'xp event training session index remains unique'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_xp_total_safe_integer_check'
  ),
  'profile xp total is constrained to the JS safe integer range'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.xp_events'::regclass
      and conname in (
        'xp_events_before_xp_safe_integer_check',
        'xp_events_after_xp_safe_integer_check'
      )
    group by conrelid
    having count(*) = 2
  ),
  'xp event snapshots are constrained to the JS safe integer range'
);
select has_function(
  'public',
  'compute_ranked_answer_xp',
  array['public.clue_difficulty', 'boolean'],
  'ranked answer xp helper exists'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'categories'
  ),
  'categories are enabled for Supabase Realtime'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'clues'
  ),
  'clues are enabled for Supabase Realtime'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'collection_members'
  ),
  'collection memberships are enabled for Supabase Realtime'
);

select has_type('public', 'collection_role', 'collection_role enum exists');
select has_type('public', 'coverage_mode', 'coverage_mode enum exists');
select has_type('public', 'clue_difficulty', 'clue_difficulty enum exists');
select has_type('public', 'invitation_status', 'invitation_status enum exists');
select has_type('public', 'training_mode', 'training_mode enum exists');
select has_type('public', 'clue_status', 'clue_status enum exists');
select has_type('public', 'platform_role', 'platform_role enum exists');
select has_table('public', 'user_roles', 'user_roles table exists');

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
select has_function('public', 'shares_collection_with', array['uuid'], 'profile visibility helper exists');
select has_function(
  'public',
  'handle_new_user',
  array[]::text[],
  'profile creation trigger function exists'
);
select has_function(
  'public',
  'handle_user_email_update',
  array[]::text[],
  'profile email trigger function exists'
);
select has_function(
  'public',
  'enforce_profile_username_change',
  array[]::text[],
  'profile username cooldown trigger function exists'
);
select has_function('public', 'is_platform_admin', array[]::text[], 'platform admin helper exists');
select has_function('public', 'is_super_admin', array[]::text[], 'super admin helper exists');
select has_function(
  'public',
  'start_training_session',
  array['uuid', 'uuid', 'public.training_mode', 'text', 'integer'],
  'training start RPC exists'
);
select function_lang_is(
  'public',
  'start_training_session',
  array['uuid', 'uuid', 'public.training_mode', 'text', 'integer'],
  'plpgsql',
  'training start RPC uses plpgsql'
);
select is_definer(
  'public',
  'start_training_session',
  array['uuid', 'uuid', 'public.training_mode', 'text', 'integer'],
  'training start RPC is security definer'
);
select function_privs_are(
  'public',
  'start_training_session',
  array['uuid', 'uuid', 'public.training_mode', 'text', 'integer'],
  'authenticated',
  array['EXECUTE'],
  'authenticated users can start ranked training sessions'
);
select function_privs_are(
  'public',
  'start_training_session',
  array['uuid', 'uuid', 'public.training_mode', 'text', 'integer'],
  'anon',
  array[]::text[],
  'anonymous users cannot start ranked training sessions'
);
select has_function(
  'public',
  'complete_training_session',
  array['uuid'],
  'training completion RPC exists'
);
select function_lang_is(
  'public',
  'complete_training_session',
  array['uuid'],
  'plpgsql',
  'training completion RPC uses plpgsql'
);
select is_definer(
  'public',
  'complete_training_session',
  array['uuid'],
  'training completion RPC is security definer'
);
select function_privs_are(
  'public',
  'complete_training_session',
  array['uuid'],
  'authenticated',
  array['EXECUTE'],
  'authenticated users can complete ranked training sessions'
);
select function_privs_are(
  'public',
  'complete_training_session',
  array['uuid'],
  'anon',
  array[]::text[],
  'anonymous users cannot complete ranked training sessions'
);
select function_returns(
  'public',
  'complete_training_session',
  array['uuid'],
  'record',
  'training completion RPC returns an enriched record payload'
);
select has_function(
  'public',
  'list_official_leaderboard_categories',
  array[]::text[],
  'official leaderboard categories RPC exists'
);
select has_function(
  'public',
  'get_category_leaderboard',
  array['uuid', 'integer', 'integer'],
  'category leaderboard RPC exists'
);
select has_function(
  'public',
  'get_my_category_progress',
  array['uuid'],
  'personal leaderboard progress RPC exists'
);
select has_function(
  'public',
  'accept_collection_invitation',
  array['text'],
  'atomic invitation acceptance RPC exists'
);
select function_lang_is(
  'public',
  'accept_collection_invitation',
  array['text'],
  'plpgsql',
  'invitation acceptance RPC uses plpgsql'
);
select is_definer(
  'public',
  'accept_collection_invitation',
  array['text'],
  'invitation acceptance RPC is security definer'
);
select function_privs_are(
  'public',
  'accept_collection_invitation',
  array['text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated users can accept invitations'
);
select function_privs_are(
  'public',
  'accept_collection_invitation',
  array['text'],
  'anon',
  array[]::text[],
  'anonymous users cannot accept invitations'
);
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
  has_function_privilege('authenticated', 'public.shares_collection_with(uuid)', 'execute'),
  true,
  'authenticated can execute profile visibility helper'
);
select is(
  has_function_privilege('anon', 'public.shares_collection_with(uuid)', 'execute'),
  false,
  'anon cannot execute profile visibility helper'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.shares_collection_with(uuid)'::regprocedure
  ),
  array['search_path=""'],
  'profile visibility helper has an empty search_path'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.handle_new_user()'::regprocedure
  ),
  array['search_path=""'],
  'profile creation trigger has an empty search_path'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.handle_user_email_update()'::regprocedure
  ),
  array['search_path=""'],
  'profile email trigger has an empty search_path'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.start_training_session(uuid, uuid, public.training_mode, text, integer)'::regprocedure
  ),
  array['search_path=""'],
  'training start RPC has an empty search_path'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.complete_training_session(uuid)'::regprocedure
  ),
  array['search_path=""'],
  'training completion RPC has an empty search_path'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.list_official_leaderboard_categories()'::regprocedure
  ),
  array['search_path=""'],
  'official leaderboard categories RPC has an empty search_path'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.get_category_leaderboard(uuid, integer, integer)'::regprocedure
  ),
  array['search_path=""'],
  'category leaderboard RPC has an empty search_path'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.get_my_category_progress(uuid)'::regprocedure
  ),
  array['search_path=""'],
  'personal leaderboard progress RPC has an empty search_path'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.enforce_profile_username_change()'::regprocedure
  ),
  array['search_path=""'],
  'profile username trigger has an empty search_path'
);
select is(
  has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'),
  false,
  'authenticated cannot execute the profile creation trigger directly'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.handle_user_email_update()',
    'execute'
  ),
  false,
  'authenticated cannot execute the profile email trigger directly'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.enforce_profile_username_change()',
    'execute'
  ),
  false,
  'authenticated cannot execute the profile username trigger directly'
);
select is(
  public.is_collection_member('30000000-0000-0000-0000-000000000001'),
  false,
  'membership helper denies requests without an authenticated user'
);
select is(
  public.shares_collection_with('10000000-0000-0000-0000-000000000001'),
  false,
  'profile helper denies requests without an authenticated user'
);
select is(
  has_function_privilege('authenticated', 'public.can_access_clue_image_object(text)', 'execute'),
  true,
  'authenticated can execute the narrow storage authorization helper'
);
select is(
  has_function_privilege('anon', 'public.can_access_clue_image_object(text)', 'execute'),
  true,
  'anon can execute the storage authorization helper for published public images'
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
    'owners can read invitations',
    'owners can create invitations',
    'owners can update invitations',
    'owners can delete invitations'
  ],
  'invitation policies are complete'
);
select policies_are(
  'public',
  'profiles',
  array[
    'users can read relevant profiles',
    'users can update own profile'
  ],
  'profile policies limit directory visibility'
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
  'public',
  'xp_events',
  array[
    'users can read own xp events'
  ],
  'xp event policies are limited to self-read access'
);
select policies_are(
  'public',
  'daily_challenge_attempts',
  array[
    'users can read own daily challenge attempts'
  ],
  'daily challenge attempt policies are limited to self-read access'
);
select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_challenges'
  ),
  'daily challenges have no direct-access policies'
);
select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_challenge_items'
  ),
  'daily challenge items have no direct-access policies'
);
select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_attempt_steps'
  ),
  'daily attempt steps have no direct-access policies'
);
select policies_are(
  'storage',
  'objects',
  array[
    'collection members can read clue images',
    'collection members can upload clue images',
    'collection members can update clue images',
    'collection members can delete clue images',
    'users can read own avatar metadata',
    'users can upload own avatars',
    'users can update own avatars',
    'users can delete own avatars'
  ],
  'storage policies are complete'
);

select row_security_active('public', 'collections', 'collections RLS is enabled');
select row_security_active('public', 'collection_members', 'memberships RLS is enabled');
select row_security_active('public', 'categories', 'categories RLS is enabled');
select row_security_active('public', 'clues', 'clues RLS is enabled');
select row_security_active('public', 'training_sessions', 'training sessions RLS is enabled');
select row_security_active('public', 'training_answers', 'training answers RLS is enabled');
select row_security_active('public', 'daily_challenges', 'daily challenges RLS is enabled');
select row_security_active('public', 'daily_challenge_items', 'daily challenge items RLS is enabled');
select row_security_active('public', 'daily_challenge_attempts', 'daily challenge attempts RLS is enabled');
select row_security_active('public', 'daily_attempt_steps', 'daily attempt steps RLS is enabled');
select is(
  has_table_privilege('authenticated', 'public.daily_challenge_attempts', 'SELECT'),
  true,
  'authenticated users can select daily challenge attempts through RLS'
);
select is(
  has_table_privilege('authenticated', 'public.daily_challenge_attempts', 'INSERT'),
  false,
  'authenticated users cannot insert daily challenge attempts directly'
);
select is(
  has_table_privilege('authenticated', 'public.daily_challenges', 'INSERT'),
  false,
  'authenticated users cannot insert daily challenges directly'
);
select is(
  has_table_privilege('authenticated', 'public.daily_challenge_items', 'INSERT'),
  false,
  'authenticated users cannot insert daily challenge items directly'
);
select is(
  has_table_privilege('authenticated', 'public.daily_attempt_steps', 'INSERT'),
  false,
  'authenticated users cannot insert daily attempt steps directly'
);
select is(
  has_table_privilege('authenticated', 'public.daily_challenge_items', 'SELECT'),
  false,
  'authenticated users cannot read daily challenge items directly'
);
select is(
  has_table_privilege('authenticated', 'public.daily_attempt_steps', 'SELECT'),
  false,
  'authenticated users cannot read daily attempt steps directly'
);
select is(
  has_table_privilege('anon', 'public.daily_challenge_attempts', 'SELECT'),
  false,
  'anonymous users cannot read daily challenge attempts'
);
select is(
  has_table_privilege('anon', 'public.daily_challenge_items', 'SELECT'),
  false,
  'anonymous users cannot read daily challenge items'
);
select is(
  has_table_privilege('anon', 'public.daily_attempt_steps', 'SELECT'),
  false,
  'anonymous users cannot read daily attempt steps'
);
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
select is(
  (
    select count(*)::integer
    from storage.buckets
    where id = 'avatars'
      and name = 'avatars'
      and public = true
      and file_size_limit = 5242880
      and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  ),
  1,
  'public avatar bucket restricts size and MIME types'
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
    '{"display_name":"Owner","avatar_url":"https://example.test/owner.png"}'::jsonb,
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
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'marc.roger@outlook.fr',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"Marc"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000005',
    'authenticated',
    'authenticated',
    'owner-collision-one@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000006',
    'authenticated',
    'authenticated',
    'owner-collision-two@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000007',
    'authenticated',
    'authenticated',
    'truncated-name@example.test',
    '',
    now(),
    '{}'::jsonb,
    jsonb_build_object('display_name', repeat('a', 29) || ' ' || 'z'),
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
      '10000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000004'
    )
  ),
  4,
  'auth user creation creates profiles'
);

update auth.users
set email = 'owner-renamed@example.test',
    raw_user_meta_data = jsonb_build_object(
      'display_name',
      'Auth Overwrite',
      'avatar_url',
      'https://example.test/overwritten.png'
    )
where id = '10000000-0000-0000-0000-000000000001';

select is(
  (
    select email
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'owner-renamed@example.test',
  'auth email updates propagate to the profile email'
);
select is(
  (
    select display_name
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'Owner',
  'auth email and metadata updates do not overwrite the username'
);
select is(
  (
    select avatar_url
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'https://example.test/owner.png',
  'auth email and metadata updates do not overwrite the avatar'
);
select is(
  (
    select count(distinct lower(display_name))::integer
    from public.profiles
    where id in (
      '10000000-0000-0000-0000-000000000005',
      '10000000-0000-0000-0000-000000000006'
    )
  ),
  2,
  'colliding auth usernames remain unique when UUID prefixes also collide'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where id in (
      '10000000-0000-0000-0000-000000000005',
      '10000000-0000-0000-0000-000000000006'
    )
      and display_name = btrim(display_name)
      and char_length(display_name) between 3 and 30
  ),
  2,
  'generated auth usernames satisfy the public username format'
);
select ok(
  (
    select display_name = btrim(display_name)
      and char_length(display_name) between 3 and 30
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000007'
  ),
  'truncated auth usernames are trimmed and satisfy the public username format'
);

select is(
  (
    select role::text
    from public.user_roles
    where user_id = '10000000-0000-0000-0000-000000000004'
  ),
  'super_admin',
  'root account is seeded as super admin when present'
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
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ update public.profiles
     set display_name = 'ab'
     where id = '10000000-0000-0000-0000-000000000003' $$,
  '23514',
  null,
  'profile usernames must contain at least three characters'
);
select throws_ok(
  $$ update public.profiles
     set display_name = repeat('x', 31)
     where id = '10000000-0000-0000-0000-000000000003' $$,
  '23514',
  null,
  'profile usernames contain at most thirty characters'
);
select throws_ok(
  $$ update public.profiles
     set display_name = ' Outsider '
     where id = '10000000-0000-0000-0000-000000000003' $$,
  '23514',
  null,
  'profile usernames must already be trimmed'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ update public.profiles
     set display_name = 'oWnEr'
     where id = '10000000-0000-0000-0000-000000000002' $$,
  '23505',
  null,
  'profile usernames are unique case-insensitively'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ update public.profiles
     set display_name = 'Owner Prime'
     where id = '10000000-0000-0000-0000-000000000001' $$,
  'first voluntary username change is allowed'
);
select ok(
  (
    select username_changed_at > clock_timestamp() - interval '1 minute'
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'first username change receives a server timestamp'
);
select set_config(
  'test.owner_username_changed_at',
  (
    select username_changed_at::text
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  true
);
select lives_ok(
  $$ update public.profiles
     set display_name = display_name,
         username_changed_at = '2000-01-01 00:00:00+00'
     where id = '10000000-0000-0000-0000-000000000001' $$,
  'an unchanged username does not count as a voluntary change'
);
select is(
  (
    select username_changed_at::text
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  current_setting('test.owner_username_changed_at'),
  'an unchanged username does not alter its change timestamp'
);
select throws_ok(
  $$ update public.profiles
     set display_name = 'Owner Again'
     where id = '10000000-0000-0000-0000-000000000001' $$,
  'P0001',
  'username can only be changed once every 30 days',
  'a second username change inside thirty days is rejected'
);

reset role;
alter table public.profiles disable trigger profiles_enforce_username_change;
update public.profiles
set username_changed_at = clock_timestamp() - interval '31 days'
where id = '10000000-0000-0000-0000-000000000001';
alter table public.profiles enable trigger profiles_enforce_username_change;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ update public.profiles
     set display_name = 'Owner Again'
     where id = '10000000-0000-0000-0000-000000000001' $$,
  'username can change after the thirty-day cooldown'
);
select ok(
  (
    select username_changed_at > clock_timestamp() - interval '1 minute'
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'post-cooldown username change receives a fresh server timestamp'
);

reset role;
insert into storage.objects (bucket_id, name, owner_id)
values (
  'avatars',
  '10000000-0000-0000-0000-000000000002/foreign.png',
  '10000000-0000-0000-0000-000000000002'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values (
       'avatars',
       '10000000-0000-0000-0000-000000000001/avatar.png',
       '10000000-0000-0000-0000-000000000001'
     ) $$,
  'users can upload avatars beneath their own user id'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values (
       'avatars',
       '10000000-0000-0000-0000-000000000002/intrusion.png',
       '10000000-0000-0000-0000-000000000001'
     ) $$,
  '42501',
  null,
  'users cannot upload avatars beneath another user id'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'avatars'
      and name = '10000000-0000-0000-0000-000000000001/avatar.png'
  ),
  1,
  'users can read metadata for avatars beneath their own user id'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'avatars'
      and name = '10000000-0000-0000-0000-000000000002/foreign.png'
  ),
  0,
  'users cannot read metadata for avatars beneath another user id'
);
select lives_ok(
  $$ update storage.objects
     set metadata = '{"mimetype":"image/png","size":1024}'::jsonb
     where bucket_id = 'avatars'
       and name = '10000000-0000-0000-0000-000000000001/avatar.png' $$,
  'users can update avatars beneath their own user id'
);
select lives_ok(
  $$ update storage.objects
     set metadata = '{"mimetype":"image/png","size":2048}'::jsonb
     where bucket_id = 'avatars'
       and name = '10000000-0000-0000-0000-000000000002/foreign.png' $$,
  'updating an avatar beneath another user id is filtered by RLS'
);
reset role;
select is(
  (
    select metadata ->> 'size'
    from storage.objects
    where bucket_id = 'avatars'
      and name = '10000000-0000-0000-0000-000000000001/avatar.png'
  ),
  '1024',
  'owned avatar metadata is changed by the allowed update'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'avatars'
      and name = '10000000-0000-0000-0000-000000000002/foreign.png'
      and metadata is not null
  ),
  0,
  'users cannot update avatars beneath another user id'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ delete from storage.objects
     where bucket_id = 'avatars'
       and name = '10000000-0000-0000-0000-000000000001/avatar.png' $$,
  'users can delete avatars beneath their own user id'
);
select lives_ok(
  $$ delete from storage.objects
     where bucket_id = 'avatars'
       and name = '10000000-0000-0000-0000-000000000002/foreign.png' $$,
  'deleting an avatar beneath another user id is filtered by RLS'
);
reset role;
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'avatars'
      and name = '10000000-0000-0000-0000-000000000001/avatar.png'
  ),
  0,
  'owned avatar is removed by the allowed delete'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'avatars'
      and name = '10000000-0000-0000-0000-000000000002/foreign.png'
  ),
  1,
  'foreign avatar remains after the denied delete'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is(
  public.is_super_admin(),
  false,
  'regular owner is not a super admin'
);
select is(
  public.is_platform_admin(),
  false,
  'regular owner is not a platform admin by default'
);

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
  $$ insert into public.user_roles (user_id, role)
     values ('10000000-0000-0000-0000-000000000002', 'admin') $$,
  '42501',
  null,
  'non super admin cannot grant platform roles'
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

select throws_ok(
  $$ update public.clues
     set coverage = 'drawn_zone'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  '22P02',
  null,
  'drawn_zone coverage is unavailable before the migration'
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
  $$ update public.clues
     set author_id = '10000000-0000-0000-0000-000000000003'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  '23514',
  'clue author_id is immutable',
  'collection member cannot reassign clue authorship'
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
  $$ insert into public.clue_images (id, clue_id, storage_path, sort_order)
     values (
       '70000000-0000-0000-0000-000000000002',
       '50000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000002.webp',
       1
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
  $$ update storage.objects
     set metadata = '{"mimetype":"image/webp","size":4096}'::jsonb
     where bucket_id = 'clue-images'
       and name = '30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.webp' $$,
  '23514',
  'published clues require draft status before storage changes',
  'published storage object cannot be replaced at the same path'
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
  $$ insert into public.clue_zones (clue_id, geojson)
     values (
       '50000000-0000-0000-0000-000000000001',
       jsonb_build_object(
         'type', 'Polygon',
         'coordinates', jsonb_build_array(
           jsonb_build_array(
             jsonb_build_array(2.20, 48.80),
             jsonb_build_array(2.45, 48.80),
             jsonb_build_array(2.45, 48.92),
             jsonb_build_array(2.20, 48.80)
           )
         )
       )
     ) $$,
  '42P01',
  null,
  'clue_zones table is unavailable before the migration'
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
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(
  (
    select count(*)::integer
    from public.collection_invitations
    where collection_id = '30000000-0000-0000-0000-000000000001'
  ),
  0,
  'editor cannot read invitation emails or token hashes'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is(
  (
    select count(*)::integer
    from public.profiles
  ),
  1,
  'outsider can only read their own profile'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000002'
  ),
  1,
  'collection owner can read an editor profile'
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

insert into public.collection_invitations (
  collection_id,
  email,
  role,
  invited_by,
  token_hash
)
values (
  '30000000-0000-0000-0000-000000000001',
  'editor@example.test',
  'editor',
  '10000000-0000-0000-0000-000000000001',
  encode(
    extensions.digest(
      convert_to('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'UTF8'),
      'sha256'
    ),
    'hex'
  )
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000003","email":"outsider@example.test","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select * from public.accept_collection_invitation(
       'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
     ) $$,
  'P0001',
  'invitation_email_mismatch',
  'invitation rejects a different authenticated email'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","email":"editor@example.test","role":"authenticated"}',
  true
);
select results_eq(
  $$ select collection_id, collection_name
     from public.accept_collection_invitation(
       'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
     ) $$,
  $$ values (
       '30000000-0000-0000-0000-000000000001'::uuid,
       'Owner collection'::text
     ) $$,
  'matching authenticated email accepts invitation atomically'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","email":"owner@example.test","role":"authenticated"}',
  true
);
select is(
  (
    select status::text
    from public.collection_invitations
    where email = 'editor@example.test'
  ),
  'accepted',
  'accepted invitation is marked accepted'
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

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is(
  public.is_super_admin(),
  true,
  'root account is recognized as super admin'
);
select is(
  public.is_platform_admin(),
  true,
  'super admin is also a platform admin'
);
select lives_ok(
  $$ insert into public.user_roles (user_id, role)
     values ('10000000-0000-0000-0000-000000000002', 'admin') $$,
  'super admin can create an admin role'
);
select is(
  (
    select count(*)::integer
    from public.user_roles
    where user_id = '10000000-0000-0000-0000-000000000002'
      and role = 'admin'
  ),
  1,
  'admin role row is created'
);
select throws_ok(
  $$ update public.user_roles
     set role = 'admin'
     where user_id = '10000000-0000-0000-0000-000000000004' $$,
  '23514',
  'root super admin role is immutable',
  'root super admin cannot be downgraded'
);
select throws_ok(
  $$ delete from public.user_roles
     where user_id = '10000000-0000-0000-0000-000000000004' $$,
  '23514',
  'root super admin role is immutable',
  'root super admin cannot be deleted'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(
  public.is_platform_admin(),
  true,
  'granted admin is recognized as platform admin'
);
select is(
  (
    select count(*)::integer
    from public.user_roles
  ),
  2,
  'platform admin can read all role rows'
);

insert into public.collections (id, owner_id, name, visibility)
values (
  '30000000-0000-0000-0000-000000000099',
  '10000000-0000-0000-0000-000000000001',
  'Official collection',
  'public_readonly'
);

insert into public.categories (id, collection_id, name)
values (
  '40000000-0000-0000-0000-000000000099',
  '30000000-0000-0000-0000-000000000099',
  'Plaques'
);

select lives_ok(
  $$ insert into public.clues (
       id,
       collection_id,
       category_id,
       country_code,
       coverage,
       difficulty,
       status,
       title,
       author_id
     )
     values (
       '50000000-0000-0000-0000-000000000098',
       '30000000-0000-0000-0000-000000000099',
       '40000000-0000-0000-0000-000000000099',
       'FR',
       'whole_country',
       'easy',
       'draft',
       'Draft public plate',
       '10000000-0000-0000-0000-000000000002'
     ) $$,
  'platform admin can create draft clues in public collections'
);
select is(
  (
    select count(*)::integer
    from public.clues
    where id = '50000000-0000-0000-0000-000000000098'
  ),
  1,
  'platform admin can read draft clues in public collections'
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
  '50000000-0000-0000-0000-000000000099',
  '30000000-0000-0000-0000-000000000099',
  '40000000-0000-0000-0000-000000000099',
  'FR',
  'whole_country',
  'easy',
  'published',
  'Plaque - France'
);

insert into storage.objects (id, bucket_id, name, owner_id, metadata)
values (
  '80000000-0000-0000-0000-000000000099',
  'clue-images',
  'official/plate-fr.jpg',
  '10000000-0000-0000-0000-000000000001',
  '{"mimetype":"image/jpeg","size":2048}'::jsonb
);

insert into public.clue_images (id, clue_id, storage_path)
values (
  '70000000-0000-0000-0000-000000000099',
  '50000000-0000-0000-0000-000000000099',
  'official/plate-fr.jpg'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is(
  public.can_access_clue_image_object('official/plate-fr.jpg'),
  true,
  'public readers can access published legacy storage paths referenced by clue_images'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'clue-images'
      and name = 'official/plate-fr.jpg'
  ),
  1,
  'standard users can read published legacy storage objects from public collections'
);

insert into public.profiles (id, display_name, avatar_url, email, leaderboard_visible)
values (
  '10000000-0000-0000-0000-000000000005',
  'HiddenAce',
  null,
  'hidden@example.test',
  false
);

insert into public.collections (id, owner_id, name, visibility)
values (
  '30000000-0000-0000-0000-000000000200',
  null,
  'Collection officielle',
  'public_readonly'
);

insert into public.categories (id, collection_id, name, icon)
values (
  '40000000-0000-0000-0000-000000000200',
  '30000000-0000-0000-0000-000000000200',
  'Drapeaux',
  'flag'
);

insert into public.clues (
  id,
  collection_id,
  category_id,
  country_code,
  coverage,
  difficulty,
  status,
  title,
  author_id
)
values (
  '50000000-0000-0000-0000-000000000200',
  '30000000-0000-0000-0000-000000000200',
  '40000000-0000-0000-0000-000000000200',
  'FR',
  'whole_country',
  'easy',
  'published',
  'Flag test clue',
  '10000000-0000-0000-0000-000000000001'
);

select is(
  (
    select is_official
    from public.collections
    where id = '30000000-0000-0000-0000-000000000200'
  ),
  true,
  'canonical public collection is marked official'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
create temp table ranked_session_under_test (
  id uuid not null primary key
) on commit drop;
select lives_ok(
  $$
    insert into ranked_session_under_test (id)
    select id
    from public.start_training_session(
      '30000000-0000-0000-0000-000000000200',
      '40000000-0000-0000-0000-000000000200',
      'world',
      null,
      3
    )
  $$,
  'authenticated users can start official ranked sessions through the RPC'
);
select is(
  (
    select is_ranked
    from public.training_sessions
    where id = (select id from ranked_session_under_test)
  ),
  true,
  'official categorized sessions are flagged as ranked'
);
select is(
  (
    select xp_total
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000004'
  ),
  0::bigint,
  'xp starts at zero for ranked-session users'
);

insert into public.training_answers (
  session_id,
  user_id,
  clue_id,
  selected_code,
  correct_code,
  is_correct
)
select
  started_session.id,
  '10000000-0000-0000-0000-000000000004',
  '50000000-0000-0000-0000-000000000200',
  answer.selected_code,
  answer.correct_code,
  answer.is_correct
from (
  select id
  from ranked_session_under_test
) as started_session
cross join (
  values
    ('FR', 'FR', true),
    ('DE', 'FR', false),
    ('FR', 'FR', true)
) as answer(selected_code, correct_code, is_correct);

select results_eq(
  $$
    select correct_answers, total_answers, is_ranked, (duration_ms > 0), xp_delta, xp_total, xp_awarded
    from public.complete_training_session(
      (select id from ranked_session_under_test)
    )
  $$,
  $$ values (2, 3, true, true, 3, 3::bigint, true) $$,
  'completion RPC calculates score totals, duration, and ranked xp payload'
);
select is(
  (
    select xp_total
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000004'
  ),
  3::bigint,
  'completing an official ranked session updates profile xp total'
);
select results_eq(
  $$
    select total_delta, correct_count, wrong_count, before_xp, after_xp
    from public.xp_events
    where training_session_id = (select id from ranked_session_under_test)
  $$,
  $$ values (3, 2, 1, 0::bigint, 3::bigint) $$,
  'completing an official ranked session writes an immutable xp event'
);
select results_eq(
  $$
    select xp_delta, xp_total, xp_awarded
    from public.complete_training_session(
      (select id from ranked_session_under_test)
    )
  $$,
  $$ values (3, 3::bigint, true) $$,
  're-completing an already finalized ranked session does not change awarded xp'
);
select is(
  (
    select count(*)::integer
    from public.xp_events
    where training_session_id = (select id from ranked_session_under_test)
  ),
  1,
  'xp events remain unique per training session'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select results_eq(
  $$
    select total_delta, after_xp
    from public.xp_events
    where user_id = '10000000-0000-0000-0000-000000000004'
      and total_delta = 3
      and correct_count = 2
      and wrong_count = 1
      and before_xp = 0
      and after_xp = 3
  $$,
  $$ values (3, 3::bigint) $$,
  'users can read their own xp events'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is(
  (
    select count(*)::integer
    from public.xp_events
  ),
  0,
  'users cannot read another player''s xp events'
);
select throws_ok(
  $$
    insert into public.xp_events (
      user_id,
      training_session_id,
      total_delta,
      correct_count,
      wrong_count,
      before_xp,
      after_xp
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '61000000-0000-0000-0000-000000000001',
      12,
      2,
      0,
      0,
      12
    )
  $$,
  '42501',
  null,
  'authenticated users cannot insert xp events directly'
);
reset role;

insert into public.daily_challenges (
  id,
  challenge_date,
  collection_id,
  category_id
)
values (
  '62000000-0000-0000-0000-000000000100',
  '2026-07-03',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001'
);

insert into public.daily_challenge_items (
  challenge_id,
  position,
  clue_id
)
values (
  '62000000-0000-0000-0000-000000000100',
  1,
  '50000000-0000-0000-0000-000000000001'
);

insert into public.daily_challenge_attempts (
  id,
  challenge_id,
  user_id,
  is_premium
)
values
  (
    '62000000-0000-0000-0000-000000000201',
    '62000000-0000-0000-0000-000000000100',
    '10000000-0000-0000-0000-000000000001',
    false
  ),
  (
    '62000000-0000-0000-0000-000000000202',
    '62000000-0000-0000-0000-000000000100',
    '10000000-0000-0000-0000-000000000002',
    true
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$
    insert into public.training_sessions (
      collection_id,
      mode,
      total_questions
    )
    values (
      '30000000-0000-0000-0000-000000000200',
      'world',
      5
    )
  $$,
  '42501',
  null,
  'direct inserts into training_sessions are revoked from authenticated users'
);
select throws_ok(
  $$
    update public.training_sessions
    set total_answers = 1
    where id = '60000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'direct updates to training_sessions are revoked from authenticated users'
);
select throws_ok(
  $$
    insert into public.daily_challenges (
      challenge_date,
      collection_id,
      category_id
    )
    values (
      '2026-07-04',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  null,
  'direct inserts into daily challenges are revoked from authenticated users'
);
select throws_ok(
  $$
    insert into public.daily_challenge_items (
      challenge_id,
      position,
      clue_id
    )
    values (
      '62000000-0000-0000-0000-000000000100',
      2,
      '50000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  null,
  'direct inserts into daily challenge items are revoked from authenticated users'
);
select throws_ok(
  $$
    insert into public.daily_challenge_attempts (
      challenge_id,
      user_id,
      is_premium
    )
    values (
      '62000000-0000-0000-0000-000000000100',
      '10000000-0000-0000-0000-000000000001',
      false
    )
  $$,
  '42501',
  null,
  'direct inserts into daily challenge attempts are revoked from authenticated users'
);
select throws_ok(
  $$
    insert into public.daily_attempt_steps (
      attempt_id,
      position,
      is_correct
    )
    values (
      '62000000-0000-0000-0000-000000000201',
      1,
      true
    )
  $$,
  '42501',
  null,
  'direct inserts into daily attempt steps are revoked from authenticated users'
);
select throws_ok(
  $$
    select *
    from public.daily_challenge_items
  $$,
  '42501',
  null,
  'direct reads from daily challenge items are revoked from authenticated users'
);
select throws_ok(
  $$
    select *
    from public.daily_attempt_steps
  $$,
  '42501',
  null,
  'direct reads from daily attempt steps are revoked from authenticated users'
);
select results_eq(
  $$
    select id, user_id
    from public.daily_challenge_attempts
    order by id
  $$,
  $$
    values (
      '62000000-0000-0000-0000-000000000201'::uuid,
      '10000000-0000-0000-0000-000000000001'::uuid
    )
  $$,
  'authenticated users can read only their own daily challenge attempt rows'
);
select is(
  (
    select count(*)::integer
    from public.daily_challenge_attempts
  ),
  1,
  'daily challenge attempts hide other users from the current player'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select results_eq(
  $$
    select id, user_id
    from public.daily_challenge_attempts
    order by id
  $$,
  $$
    values (
      '62000000-0000-0000-0000-000000000202'::uuid,
      '10000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  'a second player can read only their own daily challenge attempt row'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is(
  (
    select count(*)::integer
    from public.daily_challenge_attempts
  ),
  0,
  'players without an attempt cannot read another player''s daily challenge attempt'
);
reset role;

insert into public.training_sessions (
  id,
  user_id,
  collection_id,
  category_id,
  mode,
  total_questions,
  correct_answers,
  total_answers,
  started_at,
  completed_at,
  is_ranked,
  duration_ms
)
values
  ('61000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 0, 10, '2026-06-01T10:00:00Z', '2026-06-01T10:02:30Z', true, 999999),
  ('61000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 0, 10, '2026-06-02T10:00:00Z', '2026-06-02T10:02:30Z', true, 999999),
  ('61000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 8, 10, '2026-06-03T10:00:00Z', '2026-06-03T10:00:10Z', true, 10000),
  ('61000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 8, 10, '2026-06-04T10:00:00Z', '2026-06-04T10:00:10Z', true, 10000),
  ('61000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 8, 10, '2026-06-05T10:00:00Z', '2026-06-05T10:00:10Z', true, 10000),
  ('61000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 8, 10, '2026-06-06T10:00:00Z', '2026-06-06T10:00:10Z', true, 10000),
  ('61000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 8, 10, '2026-06-07T10:00:00Z', '2026-06-07T10:00:10Z', true, 10000),
  ('61000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 8, 10, '2026-06-08T10:00:00Z', '2026-06-08T10:00:10Z', true, 10000),
  ('61000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 8, 10, '2026-06-09T10:00:00Z', '2026-06-09T10:00:10Z', true, 10000),
  ('61000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 8, 10, '2026-06-10T10:00:00Z', '2026-06-10T10:00:10Z', true, 10000),
  ('61000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 8, 10, '2026-06-11T10:00:00Z', '2026-06-11T10:00:10Z', true, 10000),
  ('61000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 8, 10, '2026-06-12T10:00:00Z', '2026-06-12T10:00:10Z', true, 10000),
  ('61000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000099', '40000000-0000-0000-0000-000000000099', 'world', 10, 0, 10, '2026-06-13T10:00:00Z', '2026-06-13T10:02:30Z', true, 999999),
  ('61000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 8, 10, '2026-06-03T11:00:00Z', '2026-06-03T11:00:15Z', true, 15000),
  ('61000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 8, 10, '2026-06-04T11:00:00Z', '2026-06-04T11:00:15Z', true, 15000),
  ('61000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 8, 10, '2026-06-05T11:00:00Z', '2026-06-05T11:00:15Z', true, 15000),
  ('61000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 10, 10, '2026-06-03T12:00:00Z', '2026-06-03T12:00:08Z', true, 8000),
  ('61000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 10, 10, '2026-06-04T12:00:00Z', '2026-06-04T12:00:08Z', true, 8000),
  ('61000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 10, 10, '2026-06-03T13:00:00Z', '2026-06-03T13:00:07Z', true, 7000),
  ('61000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 10, 10, '2026-06-04T13:00:00Z', '2026-06-04T13:00:07Z', true, 7000),
  ('61000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000200', '40000000-0000-0000-0000-000000000200', 'world', 10, 10, 10, '2026-06-05T13:00:00Z', '2026-06-05T13:00:07Z', true, 7000);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select results_eq(
  $$
    select id, name, collection_name
    from public.list_official_leaderboard_categories()
    order by name
  $$,
  $$
    values (
      '40000000-0000-0000-0000-000000000200'::uuid,
      'Drapeaux'::text,
      'Collection officielle'::text
    )
  $$,
  'official leaderboard categories lists the canonical official category'
);
select results_eq(
  $$
    select username, rank, accuracy_percent, average_ms_per_answer, quiz_count, total_count
    from public.get_category_leaderboard(
      '40000000-0000-0000-0000-000000000200',
      25,
      0
    )
    order by rank
  $$,
  $$
    values
      ('Owner'::text, 1::bigint, 80.00::numeric, 1000::bigint, 10::bigint, 2::bigint),
      ('Editor'::text, 2::bigint, 80.00::numeric, 1500::bigint, 3::bigint, 2::bigint)
  $$,
  'leaderboard keeps only official latest-ten visible players and orders score before speed'
);
select ok(
  not (
    (
      select row_to_json(entry)::jsonb
      from public.get_category_leaderboard(
        '40000000-0000-0000-0000-000000000200',
        25,
        0
      ) as entry
      limit 1
    ) ? 'email'
  ),
  'leaderboard rows expose no email field'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select results_eq(
  $$
    select rank, accuracy_percent, average_ms_per_answer, quiz_count, remaining_quizzes, visible
    from public.get_my_category_progress('40000000-0000-0000-0000-000000000200')
  $$,
  $$ values (null::bigint, 100.00::numeric, 800::bigint, 2::bigint, 1::bigint, true) $$,
  'players with fewer than three quizzes keep personal progress but no public rank'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select results_eq(
  $$
    select rank, accuracy_percent, average_ms_per_answer, quiz_count, remaining_quizzes, visible
    from public.get_my_category_progress('40000000-0000-0000-0000-000000000200')
  $$,
  $$ values (null::bigint, 100.00::numeric, 700::bigint, 3::bigint, 0::bigint, false) $$,
  'hidden profiles are omitted publicly but still see their own progress'
);
reset role;

select *
from finish();

rollback;
