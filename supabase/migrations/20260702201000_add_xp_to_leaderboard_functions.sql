drop function if exists public.get_category_leaderboard(uuid, integer, integer);
drop function if exists public.get_daily_challenge_leaderboard(uuid, uuid, text, integer, integer);

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
  xp_total bigint,
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
      profile.xp_total,
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
      row.xp_total,
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
    row.xp_total,
    row.total_count
  from ranked_rows as row
  order by row.rank
  limit greatest(1, least(coalesce(p_limit, 25), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.get_daily_challenge_leaderboard(
  p_collection_id uuid,
  p_category_id uuid,
  p_challenge_key text,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  rank bigint,
  accuracy_percent numeric,
  duration_ms bigint,
  quiz_count bigint,
  completed_at timestamptz,
  xp_total bigint,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with best_attempts as (
    select
      session.user_id,
      session.correct_answers,
      session.total_answers,
      session.duration_ms,
      session.completed_at,
      count(*) over (partition by session.user_id)::bigint as quiz_count,
      row_number() over (
        partition by session.user_id
        order by
          case
            when session.total_answers > 0
              then session.correct_answers::numeric / session.total_answers::numeric
            else 0::numeric
          end desc,
          session.duration_ms asc,
          session.completed_at asc,
          session.id asc
      ) as best_rank
    from public.training_sessions as session
    join public.collections as collection
      on collection.id = session.collection_id
    where session.collection_id = p_collection_id
      and session.category_id = p_category_id
      and session.challenge_type = 'daily'
      and session.challenge_key = p_challenge_key
      and session.is_ranked
      and session.completed_at is not null
      and session.total_answers > 0
      and session.duration_ms is not null
      and collection.is_official
  ),
  visible_rows as (
    select
      attempt.user_id,
      profile.display_name as username,
      profile.avatar_url,
      profile.xp_total,
      round(
        100.0 * attempt.correct_answers::numeric
        / nullif(attempt.total_answers, 0),
        2
      ) as accuracy_percent,
      attempt.duration_ms,
      attempt.quiz_count,
      attempt.completed_at
    from best_attempts as attempt
    join public.profiles as profile
      on profile.id = attempt.user_id
    where attempt.best_rank = 1
      and profile.leaderboard_visible
  ),
  ranked_rows as (
    select
      row.user_id,
      row.username,
      row.avatar_url,
      row.xp_total,
      row_number() over (
        order by
          row.accuracy_percent desc,
          row.duration_ms asc,
          row.completed_at asc,
          row.username asc
      ) as rank,
      row.accuracy_percent,
      row.duration_ms,
      row.quiz_count,
      row.completed_at,
      count(*) over () as total_count
    from visible_rows as row
  )
  select
    row.user_id,
    row.username,
    row.avatar_url,
    row.rank,
    row.accuracy_percent,
    row.duration_ms,
    row.quiz_count,
    row.completed_at,
    row.xp_total,
    row.total_count
  from ranked_rows as row
  order by row.rank
  limit greatest(1, least(coalesce(p_limit, 25), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;
