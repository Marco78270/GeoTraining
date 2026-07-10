alter table public.training_sessions
  add column if not exists challenge_type text not null default 'standard',
  add column if not exists challenge_key text;

alter table public.training_sessions
  drop constraint if exists training_sessions_challenge_type_check;

alter table public.training_sessions
  add constraint training_sessions_challenge_type_check
  check (challenge_type in ('standard', 'daily'));

alter table public.training_sessions
  drop constraint if exists training_sessions_daily_key_required;

alter table public.training_sessions
  add constraint training_sessions_daily_key_required
  check (
    (challenge_type = 'standard' and challenge_key is null)
    or (
      challenge_type = 'daily'
      and challenge_key is not null
      and char_length(btrim(challenge_key)) between 8 and 40
    )
  );

create index if not exists training_sessions_daily_lookup_idx
on public.training_sessions (user_id, challenge_type, challenge_key, completed_at desc)
where challenge_type = 'daily';

create or replace function public.start_training_session(
  p_collection_id uuid,
  p_category_id uuid,
  p_mode public.training_mode,
  p_country_code text,
  p_total_questions integer,
  p_challenge_type text default 'standard',
  p_challenge_key text default null
)
returns public.training_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_collection public.collections%rowtype;
  created_session public.training_sessions%rowtype;
  normalized_challenge_type text := coalesce(lower(p_challenge_type), 'standard');
  normalized_challenge_key text := nullif(btrim(coalesce(p_challenge_key, '')), '');
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001';
  end if;

  if p_total_questions is null or p_total_questions < 1 then
    raise exception 'training_total_questions_invalid'
      using errcode = 'P0001';
  end if;

  select collection.*
  into target_collection
  from public.collections as collection
  where collection.id = p_collection_id
    and public.can_read_collection(collection.id);

  if not found then
    raise exception 'training_collection_not_accessible'
      using errcode = 'P0001';
  end if;

  if p_mode = 'world' and p_country_code is not null then
    raise exception 'training_country_code_not_allowed'
      using errcode = 'P0001';
  end if;

  if p_mode = 'country' and p_country_code is null then
    raise exception 'training_country_code_required'
      using errcode = 'P0001';
  end if;

  if p_category_id is not null and not exists (
    select 1
    from public.categories as category
    where category.id = p_category_id
      and category.collection_id = p_collection_id
      and public.can_read_collection(category.collection_id)
  ) then
    raise exception 'training_category_not_accessible'
      using errcode = 'P0001';
  end if;

  if normalized_challenge_type not in ('standard', 'daily') then
    raise exception 'training_challenge_type_invalid'
      using errcode = 'P0001';
  end if;

  if normalized_challenge_type = 'daily' then
    if normalized_challenge_key is null then
      raise exception 'training_daily_challenge_key_required'
        using errcode = 'P0001';
    end if;

    if not target_collection.is_official or p_category_id is null then
      raise exception 'training_daily_challenge_not_allowed'
        using errcode = 'P0001';
    end if;

    if not public.has_premium_access() then
      raise exception 'training_daily_challenge_premium_required'
        using errcode = 'P0001';
    end if;
  else
    normalized_challenge_key := null;
  end if;

  insert into public.training_sessions (
    user_id,
    collection_id,
    category_id,
    mode,
    country_code,
    total_questions,
    started_at,
    is_ranked,
    challenge_type,
    challenge_key
  )
  values (
    current_user_id,
    p_collection_id,
    p_category_id,
    p_mode,
    p_country_code,
    p_total_questions,
    clock_timestamp(),
    target_collection.is_official and p_category_id is not null,
    normalized_challenge_type,
    normalized_challenge_key
  )
  returning *
  into created_session;

  return created_session;
end;
$$;

create or replace function public.get_my_daily_challenge_progress(
  p_collection_id uuid,
  p_challenge_key text
)
returns table (
  completed_sessions bigint,
  best_accuracy_percent numeric,
  best_duration_ms bigint,
  latest_completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::bigint as completed_sessions,
    max(
      round(
        100.0 * session.correct_answers::numeric
        / nullif(session.total_answers, 0),
        2
      )
    ) as best_accuracy_percent,
    min(session.duration_ms) as best_duration_ms,
    max(session.completed_at) as latest_completed_at
  from public.training_sessions as session
  where session.user_id = auth.uid()
    and session.collection_id = p_collection_id
    and session.challenge_type = 'daily'
    and session.challenge_key = nullif(btrim(coalesce(p_challenge_key, '')), '')
    and session.completed_at is not null
    and session.total_answers > 0;
$$;

revoke all on function public.start_training_session(uuid, uuid, public.training_mode, text, integer, text, text) from public, anon;
revoke all on function public.get_my_daily_challenge_progress(uuid, text) from public, anon;

grant execute on function public.start_training_session(uuid, uuid, public.training_mode, text, integer, text, text) to authenticated;
grant execute on function public.get_my_daily_challenge_progress(uuid, text) to authenticated;
