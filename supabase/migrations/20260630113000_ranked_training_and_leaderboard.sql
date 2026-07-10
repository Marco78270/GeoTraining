alter table public.collections
  add column if not exists is_official boolean not null default false;

update public.collections
set is_official = (name = 'Collection officielle' and visibility = 'public_readonly');

create unique index if not exists collections_single_official_idx
on public.collections (is_official)
where is_official;

alter table public.training_sessions
  add column if not exists is_ranked boolean not null default false,
  add column if not exists duration_ms bigint;

alter table public.training_sessions
  drop constraint if exists training_sessions_duration_positive;

alter table public.training_sessions
  add constraint training_sessions_duration_positive
  check (duration_ms is null or duration_ms > 0);

create index if not exists training_sessions_ranked_category_user_completed_idx
on public.training_sessions (category_id, user_id, completed_at desc)
where is_ranked and completed_at is not null;

create or replace function public.start_training_session(
  p_collection_id uuid,
  p_category_id uuid,
  p_mode public.training_mode,
  p_country_code text,
  p_total_questions integer
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

  insert into public.training_sessions (
    user_id,
    collection_id,
    category_id,
    mode,
    country_code,
    total_questions,
    started_at,
    is_ranked
  )
  values (
    current_user_id,
    p_collection_id,
    p_category_id,
    p_mode,
    p_country_code,
    p_total_questions,
    clock_timestamp(),
    target_collection.is_official and p_category_id is not null
  )
  returning *
  into created_session;

  return created_session;
end;
$$;

create or replace function public.complete_training_session(p_session_id uuid)
returns public.training_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  existing_session public.training_sessions%rowtype;
  completed_session public.training_sessions%rowtype;
  answer_count integer := 0;
  correct_count integer := 0;
  completed_at_ts timestamptz := clock_timestamp();
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001';
  end if;

  select session.*
  into existing_session
  from public.training_sessions as session
  where session.id = p_session_id
    and session.user_id = current_user_id;

  if not found then
    raise exception 'training_session_not_found'
      using errcode = 'P0001';
  end if;

  if existing_session.completed_at is not null then
    return existing_session;
  end if;

  select
    count(*)::integer,
    count(*) filter (where answer.is_correct)::integer
  into answer_count, correct_count
  from public.training_answers as answer
  where answer.session_id = p_session_id
    and answer.user_id = current_user_id;

  update public.training_sessions as session
  set total_answers = answer_count,
      correct_answers = correct_count,
      completed_at = completed_at_ts,
      duration_ms = greatest(
        1,
        floor(
          extract(epoch from (completed_at_ts - session.started_at)) * 1000
        )::bigint
      )
  where session.id = p_session_id
    and session.user_id = current_user_id
    and session.completed_at is null
  returning session.*
  into completed_session;

  if completed_session.id is null then
    select session.*
    into completed_session
    from public.training_sessions as session
    where session.id = p_session_id
      and session.user_id = current_user_id;
  end if;

  return completed_session;
end;
$$;

create or replace function public.list_official_leaderboard_categories()
returns table (
  id uuid,
  name text,
  icon text,
  collection_id uuid,
  collection_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    category.id,
    category.name,
    category.icon,
    collection.id as collection_id,
    collection.name as collection_name
  from public.categories as category
  join public.collections as collection
    on collection.id = category.collection_id
  where collection.is_official
    and (
      exists (
        select 1
        from public.clues as clue
        where clue.category_id = category.id
          and clue.status = 'published'
      )
      or exists (
        select 1
        from public.training_sessions as session
        where session.category_id = category.id
          and session.is_ranked
      )
    )
  order by category.name asc;
$$;

create or replace function public.get_category_leaderboard(
  p_category_id uuid,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  rank bigint,
  accuracy_percent numeric,
  average_ms_per_answer bigint,
  quiz_count bigint,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible_sessions as (
    select
      session.user_id,
      session.category_id,
      session.correct_answers,
      session.total_answers,
      session.duration_ms,
      session.completed_at,
      row_number() over (
        partition by session.user_id, session.category_id
        order by session.completed_at desc, session.id desc
      ) as recent_rank
    from public.training_sessions as session
    join public.collections as collection
      on collection.id = session.collection_id
    where session.category_id = p_category_id
      and session.is_ranked
      and session.completed_at is not null
      and session.total_answers > 0
      and session.duration_ms is not null
      and collection.is_official
  ),
  aggregated as (
    select
      session.user_id,
      round(
        100.0 * sum(session.correct_answers)::numeric
        / nullif(sum(session.total_answers), 0),
        2
      ) as accuracy_percent,
      round(
        sum(session.duration_ms)::numeric
        / nullif(sum(session.total_answers), 0)
      )::bigint as average_ms_per_answer,
      count(*)::bigint as quiz_count
    from eligible_sessions as session
    where session.recent_rank <= 10
    group by session.user_id
  ),
  visible_rows as (
    select
      aggregate.user_id,
      profile.display_name as username,
      profile.avatar_url,
      aggregate.accuracy_percent,
      aggregate.average_ms_per_answer,
      aggregate.quiz_count
    from aggregated as aggregate
    join public.profiles as profile
      on profile.id = aggregate.user_id
    where aggregate.quiz_count >= 3
      and profile.leaderboard_visible
  ),
  ranked_rows as (
    select
      row.user_id,
      row.username,
      row.avatar_url,
      row_number() over (
        order by
          row.accuracy_percent desc,
          row.average_ms_per_answer asc,
          row.quiz_count desc,
          row.username asc
      ) as rank,
      row.accuracy_percent,
      row.average_ms_per_answer,
      row.quiz_count,
      count(*) over () as total_count
    from visible_rows as row
  )
  select
    row.user_id,
    row.username,
    row.avatar_url,
    row.rank,
    row.accuracy_percent,
    row.average_ms_per_answer,
    row.quiz_count,
    row.total_count
  from ranked_rows as row
  order by row.rank
  limit greatest(1, least(coalesce(p_limit, 25), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.get_my_category_progress(p_category_id uuid)
returns table (
  rank bigint,
  accuracy_percent numeric,
  average_ms_per_answer bigint,
  quiz_count bigint,
  remaining_quizzes bigint,
  visible boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_profile as (
    select
      profile.id,
      profile.leaderboard_visible
    from public.profiles as profile
    where profile.id = auth.uid()
  ),
  eligible_sessions as (
    select
      session.user_id,
      session.category_id,
      session.correct_answers,
      session.total_answers,
      session.duration_ms,
      session.completed_at,
      row_number() over (
        partition by session.user_id, session.category_id
        order by session.completed_at desc, session.id desc
      ) as recent_rank
    from public.training_sessions as session
    join public.collections as collection
      on collection.id = session.collection_id
    where session.category_id = p_category_id
      and session.is_ranked
      and session.completed_at is not null
      and session.total_answers > 0
      and session.duration_ms is not null
      and collection.is_official
  ),
  aggregated as (
    select
      session.user_id,
      round(
        100.0 * sum(session.correct_answers)::numeric
        / nullif(sum(session.total_answers), 0),
        2
      ) as accuracy_percent,
      round(
        sum(session.duration_ms)::numeric
        / nullif(sum(session.total_answers), 0)
      )::bigint as average_ms_per_answer,
      count(*)::bigint as quiz_count
    from eligible_sessions as session
    where session.recent_rank <= 10
    group by session.user_id
  ),
  visible_rows as (
    select
      aggregate.user_id,
      profile.display_name as username,
      aggregate.accuracy_percent,
      aggregate.average_ms_per_answer,
      aggregate.quiz_count
    from aggregated as aggregate
    join public.profiles as profile
      on profile.id = aggregate.user_id
    where aggregate.quiz_count >= 3
      and profile.leaderboard_visible
  ),
  ranked_rows as (
    select
      row.user_id,
      row_number() over (
        order by
          row.accuracy_percent desc,
          row.average_ms_per_answer asc,
          row.quiz_count desc,
          row.username asc
      ) as rank
    from visible_rows as row
  )
  select
    ranked.rank,
    aggregate.accuracy_percent,
    aggregate.average_ms_per_answer,
    coalesce(aggregate.quiz_count, 0) as quiz_count,
    greatest(0::bigint, 3 - coalesce(aggregate.quiz_count, 0)) as remaining_quizzes,
    coalesce(profile.leaderboard_visible, false) as visible
  from current_profile as profile
  left join aggregated as aggregate
    on aggregate.user_id = profile.id
  left join ranked_rows as ranked
    on ranked.user_id = profile.id
  limit 1;
$$;

revoke insert, update on public.training_sessions from authenticated;

revoke all on function public.start_training_session(uuid, uuid, public.training_mode, text, integer) from public, anon;
revoke all on function public.complete_training_session(uuid) from public, anon;
revoke all on function public.list_official_leaderboard_categories() from public, anon;
revoke all on function public.get_category_leaderboard(uuid, integer, integer) from public, anon;
revoke all on function public.get_my_category_progress(uuid) from public, anon;

grant execute on function public.start_training_session(uuid, uuid, public.training_mode, text, integer) to authenticated;
grant execute on function public.complete_training_session(uuid) to authenticated;
grant execute on function public.list_official_leaderboard_categories() to authenticated;
grant execute on function public.get_category_leaderboard(uuid, integer, integer) to authenticated;
grant execute on function public.get_my_category_progress(uuid) to authenticated;
