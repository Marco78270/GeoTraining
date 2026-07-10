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
    row.total_count
  from ranked_rows as row
  order by row.rank
  limit greatest(1, least(coalesce(p_limit, 25), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.get_my_daily_challenge_leaderboard_progress(
  p_collection_id uuid,
  p_category_id uuid,
  p_challenge_key text
)
returns table (
  rank bigint,
  accuracy_percent numeric,
  duration_ms bigint,
  completed_sessions bigint,
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
      session.id,
      session.user_id,
      session.correct_answers,
      session.total_answers,
      session.duration_ms,
      session.completed_at
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
  best_attempts as (
    select
      session.user_id,
      count(*) over (partition by session.user_id)::bigint as completed_sessions,
      round(
        100.0 * session.correct_answers::numeric
        / nullif(session.total_answers, 0),
        2
      ) as accuracy_percent,
      session.duration_ms,
      session.completed_at,
      row_number() over (
        order by
          round(
            100.0 * session.correct_answers::numeric
            / nullif(session.total_answers, 0),
            2
          ) desc,
          session.duration_ms asc,
          session.completed_at asc,
          session.id asc
      ) as best_rank
    from eligible_sessions as session
    where session.user_id = auth.uid()
  ),
  visible_rows as (
    select
      attempt.user_id,
      profile.display_name as username,
      attempt.accuracy_percent,
      attempt.duration_ms,
      attempt.completed_at
    from (
      select
        session.user_id,
        round(
          100.0 * session.correct_answers::numeric
          / nullif(session.total_answers, 0),
          2
        ) as accuracy_percent,
        session.duration_ms,
        session.completed_at,
        row_number() over (
          partition by session.user_id
          order by
            case
              when session.total_answers > 0
                then session.correct_answers::numeric
                  / session.total_answers::numeric
              else 0::numeric
            end desc,
            session.duration_ms asc,
            session.completed_at asc,
            session.id asc
        ) as best_rank
      from eligible_sessions as session
    ) as attempt
    join public.profiles as profile
      on profile.id = attempt.user_id
    where profile.leaderboard_visible
      and attempt.best_rank = 1
  ),
  ranked_rows as (
    select
      row.user_id,
      row_number() over (
        order by
          row.accuracy_percent desc,
          row.duration_ms asc,
          row.completed_at asc,
          row.username asc
      ) as rank
    from visible_rows as row
  )
  select
    ranked.rank,
    attempt.accuracy_percent,
    attempt.duration_ms,
    coalesce(attempt.completed_sessions, 0) as completed_sessions,
    coalesce(profile.leaderboard_visible, false) as visible
  from current_profile as profile
  left join best_attempts as attempt
    on attempt.user_id = profile.id
   and attempt.best_rank = 1
  left join ranked_rows as ranked
    on ranked.user_id = profile.id
  limit 1;
$$;

revoke all on function public.get_daily_challenge_leaderboard(uuid, uuid, text, integer, integer) from public, anon;
revoke all on function public.get_my_daily_challenge_leaderboard_progress(uuid, uuid, text) from public, anon;

grant execute on function public.get_daily_challenge_leaderboard(uuid, uuid, text, integer, integer) to authenticated;
grant execute on function public.get_my_daily_challenge_leaderboard_progress(uuid, uuid, text) to authenticated;
