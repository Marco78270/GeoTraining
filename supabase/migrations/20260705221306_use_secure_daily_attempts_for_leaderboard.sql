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
  with eligible_attempts as (
    select
      attempt.user_id,
      attempt.correct_answers,
      challenge.question_count,
      attempt.duration_ms,
      attempt.completed_at
    from public.daily_challenge_attempts as attempt
    join public.daily_challenges as challenge
      on challenge.id = attempt.challenge_id
    join public.collections as collection
      on collection.id = challenge.collection_id
    where challenge.collection_id = p_collection_id
      and challenge.category_id = p_category_id
      and challenge.challenge_date::text = p_challenge_key
      and attempt.is_premium
      and attempt.completed_at is not null
      and attempt.correct_answers is not null
      and attempt.duration_ms is not null
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
        / nullif(attempt.question_count, 0),
        2
      ) as accuracy_percent,
      attempt.duration_ms,
      1::bigint as quiz_count,
      attempt.completed_at
    from eligible_attempts as attempt
    join public.profiles as profile
      on profile.id = attempt.user_id
    where profile.leaderboard_visible
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
          row.username asc,
          row.user_id asc
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
    where profile.id = (select auth.uid())
  ),
  eligible_attempts as (
    select
      attempt.user_id,
      round(
        100.0 * attempt.correct_answers::numeric
        / nullif(challenge.question_count, 0),
        2
      ) as accuracy_percent,
      attempt.duration_ms,
      attempt.completed_at
    from public.daily_challenge_attempts as attempt
    join public.daily_challenges as challenge
      on challenge.id = attempt.challenge_id
    join public.collections as collection
      on collection.id = challenge.collection_id
    where challenge.collection_id = p_collection_id
      and challenge.category_id = p_category_id
      and challenge.challenge_date::text = p_challenge_key
      and attempt.is_premium
      and attempt.completed_at is not null
      and attempt.correct_answers is not null
      and attempt.duration_ms is not null
      and collection.is_official
  ),
  ranked_rows as (
    select
      attempt.user_id,
      attempt.accuracy_percent,
      attempt.duration_ms,
      row_number() over (
        order by
          attempt.accuracy_percent desc,
          attempt.duration_ms asc,
          attempt.completed_at asc,
          profile.display_name asc,
          attempt.user_id asc
      ) as rank
    from eligible_attempts as attempt
    join public.profiles as profile
      on profile.id = attempt.user_id
    where profile.leaderboard_visible
  )
  select
    ranked.rank,
    mine.accuracy_percent,
    mine.duration_ms,
    case when mine.user_id is null then 0::bigint else 1::bigint end,
    coalesce(profile.leaderboard_visible, false)
  from current_profile as profile
  left join eligible_attempts as mine
    on mine.user_id = profile.id
  left join ranked_rows as ranked
    on ranked.user_id = profile.id
  limit 1;
$$;

revoke all on function public.get_daily_challenge_leaderboard(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.get_my_daily_challenge_leaderboard_progress(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_daily_challenge_leaderboard(uuid, uuid, text, integer, integer)
  to authenticated;
grant execute on function public.get_my_daily_challenge_leaderboard_progress(uuid, uuid, text)
  to authenticated;
