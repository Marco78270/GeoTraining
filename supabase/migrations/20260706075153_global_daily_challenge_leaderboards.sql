alter table public.daily_challenges
  alter column category_id drop not null;

create or replace function public.compute_daily_leaderboard_points(
  p_correct_answers integer,
  p_duration_ms bigint
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select
    10
    + greatest(0, least(10, coalesce(p_correct_answers, 0))) * 100
    + greatest(
        0,
        90 - floor(greatest(0, coalesce(p_duration_ms, 0))::numeric / 3334)::integer
      );
$$;

create or replace function public.get_or_create_daily_challenge()
returns table (
  status text,
  challenge_id uuid,
  challenge_key text,
  collection_id uuid,
  collection_name text,
  category_id uuid,
  category_name text,
  mode text,
  question_count integer,
  seconds_until_reset integer,
  attempt_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  challenge_day date := (clock_timestamp() at time zone 'Europe/Paris')::date;
  seconds_left integer := greatest(
    0,
    floor(
      extract(
        epoch from (
          timezone('Europe/Paris', (challenge_day + 1)::timestamp) - clock_timestamp()
        )
      )
    )::integer
  );
  selected_collection_id uuid;
  selected_collection_name text;
  selected_category_id uuid;
  selected_category_name text := 'Toutes les categories';
  resolved_challenge_id uuid;
  resolved_attempt_status text := 'not_started';
  resolved_status text := 'available';
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(challenge_day::text, 0));

  select
    challenge.id,
    challenge.collection_id,
    collection.name,
    challenge.category_id,
    coalesce(category.name, 'Toutes les categories')
  into
    resolved_challenge_id,
    selected_collection_id,
    selected_collection_name,
    selected_category_id,
    selected_category_name
  from public.daily_challenges as challenge
  join public.collections as collection
    on collection.id = challenge.collection_id
  left join public.categories as category
    on category.id = challenge.category_id
  where challenge.challenge_date = challenge_day;

  if resolved_challenge_id is null then
    with eligible as (
      select
        collection.id as collection_id,
        collection.name as collection_name,
        clue.id as clue_id,
        clue.category_id,
        row_number() over (
          partition by collection.id, clue.category_id
          order by md5(challenge_day::text || clue.id::text), clue.id
        ) as category_round
      from public.collections as collection
      join public.clues as clue
        on clue.collection_id = collection.id
      where collection.is_official
        and clue.status = 'published'
        and exists (
          select 1
          from public.clue_images as image
          where image.clue_id = clue.id
        )
    ),
    eligible_collections as (
      select
        eligible.collection_id,
        min(eligible.collection_name) as collection_name
      from eligible
      group by eligible.collection_id
      having count(*) >= 10
    )
    select
      candidate.collection_id,
      candidate.collection_name
    into
      selected_collection_id,
      selected_collection_name
    from eligible_collections as candidate
    order by
      md5(challenge_day::text || candidate.collection_id::text),
      candidate.collection_id
    limit 1;

    if selected_collection_id is null then
      raise exception 'daily_challenge_unavailable'
        using errcode = 'P0001';
    end if;

    selected_category_id := null;
    selected_category_name := 'Toutes les categories';

    insert into public.daily_challenges (
      challenge_date,
      collection_id,
      category_id,
      mode,
      question_count
    )
    values (
      challenge_day,
      selected_collection_id,
      null,
      'world',
      10
    )
    returning id into resolved_challenge_id;

    insert into public.daily_challenge_items (challenge_id, position, clue_id)
    with eligible as (
      select
        clue.id as clue_id,
        clue.category_id,
        row_number() over (
          partition by clue.category_id
          order by md5(challenge_day::text || clue.id::text), clue.id
        ) as category_round
      from public.clues as clue
      where clue.collection_id = selected_collection_id
        and clue.status = 'published'
        and exists (
          select 1
          from public.clue_images as image
          where image.clue_id = clue.id
        )
    ),
    balanced as (
      select eligible.clue_id
      from eligible
      order by
        eligible.category_round,
        md5(challenge_day::text || eligible.category_id::text),
        md5(challenge_day::text || eligible.clue_id::text),
        eligible.clue_id
      limit 10
    ),
    ordered as (
      select
        balanced.clue_id,
        row_number() over (
          order by
            md5(challenge_day::text || 'final' || balanced.clue_id::text),
            balanced.clue_id
        ) as position
      from balanced
    )
    select
      resolved_challenge_id,
      ordered.position::smallint,
      ordered.clue_id
    from ordered;
  end if;

  select
    case when attempt.completed_at is not null then 'completed' else 'in_progress' end
  into resolved_attempt_status
  from public.daily_challenge_attempts as attempt
  where attempt.challenge_id = resolved_challenge_id
    and attempt.user_id = current_user_id;

  if found then
    resolved_status := resolved_attempt_status;
  end if;

  return query
  select
    resolved_status,
    resolved_challenge_id,
    challenge_day::text,
    selected_collection_id,
    selected_collection_name,
    selected_category_id,
    selected_category_name,
    'world'::text,
    10,
    seconds_left,
    resolved_attempt_status;
end;
$$;

drop function if exists public.get_daily_challenge_leaderboard(uuid, uuid, text, integer, integer);
drop function if exists public.get_my_daily_challenge_leaderboard_progress(uuid, uuid, text);

create function public.get_daily_challenge_leaderboard(
  p_challenge_key text,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  rank bigint,
  correct_answers integer,
  accuracy_percent numeric,
  duration_ms bigint,
  daily_points integer,
  completed_at timestamptz,
  xp_total bigint,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      attempt.user_id,
      attempt.correct_answers,
      challenge.question_count,
      attempt.duration_ms,
      attempt.completed_at,
      public.compute_daily_leaderboard_points(
        attempt.correct_answers,
        attempt.duration_ms
      ) as daily_points
    from public.daily_challenge_attempts as attempt
    join public.daily_challenges as challenge
      on challenge.id = attempt.challenge_id
    join public.collections as collection
      on collection.id = challenge.collection_id
    where challenge.challenge_date::text = p_challenge_key
      and attempt.is_premium
      and attempt.completed_at is not null
      and attempt.correct_answers is not null
      and attempt.duration_ms is not null
      and collection.is_official
  ),
  ranked as (
    select
      eligible.user_id,
      profile.display_name as username,
      profile.avatar_url,
      row_number() over (
        order by
          eligible.correct_answers desc,
          eligible.duration_ms asc,
          eligible.completed_at asc,
          profile.display_name asc,
          eligible.user_id asc
      ) as rank,
      eligible.correct_answers,
      round(
        100.0 * eligible.correct_answers::numeric
        / nullif(eligible.question_count, 0),
        2
      ) as accuracy_percent,
      eligible.duration_ms,
      eligible.daily_points,
      eligible.completed_at,
      profile.xp_total,
      count(*) over () as total_count
    from eligible
    join public.profiles as profile
      on profile.id = eligible.user_id
    where profile.leaderboard_visible
  )
  select *
  from ranked
  order by ranked.rank
  limit greatest(1, least(coalesce(p_limit, 25), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.get_global_daily_leaderboard(
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  rank bigint,
  total_points bigint,
  participation_count bigint,
  correct_answers bigint,
  total_answers bigint,
  accuracy_percent numeric,
  total_duration_ms bigint,
  xp_total bigint,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      attempt.user_id,
      attempt.correct_answers,
      challenge.question_count,
      attempt.duration_ms,
      public.compute_daily_leaderboard_points(
        attempt.correct_answers,
        attempt.duration_ms
      ) as daily_points
    from public.daily_challenge_attempts as attempt
    join public.daily_challenges as challenge
      on challenge.id = attempt.challenge_id
    join public.collections as collection
      on collection.id = challenge.collection_id
    where attempt.is_premium
      and attempt.completed_at is not null
      and attempt.correct_answers is not null
      and attempt.duration_ms is not null
      and collection.is_official
  ),
  totals as (
    select
      eligible.user_id,
      sum(eligible.daily_points)::bigint as total_points,
      count(*)::bigint as participation_count,
      sum(eligible.correct_answers)::bigint as correct_answers,
      sum(eligible.question_count)::bigint as total_answers,
      round(
        100.0 * sum(eligible.correct_answers)::numeric
        / nullif(sum(eligible.question_count), 0),
        2
      ) as accuracy_percent,
      sum(eligible.duration_ms)::bigint as total_duration_ms
    from eligible
    group by eligible.user_id
  ),
  ranked as (
    select
      totals.user_id,
      profile.display_name as username,
      profile.avatar_url,
      row_number() over (
        order by
          totals.total_points desc,
          totals.correct_answers desc,
          totals.total_duration_ms asc,
          totals.participation_count desc,
          totals.user_id asc
      ) as rank,
      totals.total_points,
      totals.participation_count,
      totals.correct_answers,
      totals.total_answers,
      totals.accuracy_percent,
      totals.total_duration_ms,
      profile.xp_total,
      count(*) over () as total_count
    from totals
    join public.profiles as profile
      on profile.id = totals.user_id
    where profile.leaderboard_visible
  )
  select *
  from ranked
  order by ranked.rank
  limit greatest(1, least(coalesce(p_limit, 25), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.get_my_daily_challenge_leaderboard_progress(
  p_challenge_key text
)
returns table (
  rank bigint,
  correct_answers integer,
  accuracy_percent numeric,
  duration_ms bigint,
  daily_points integer,
  visible boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      attempt.user_id,
      attempt.correct_answers,
      challenge.question_count,
      attempt.duration_ms,
      attempt.completed_at,
      public.compute_daily_leaderboard_points(
        attempt.correct_answers,
        attempt.duration_ms
      ) as daily_points
    from public.daily_challenge_attempts as attempt
    join public.daily_challenges as challenge
      on challenge.id = attempt.challenge_id
    join public.collections as collection
      on collection.id = challenge.collection_id
    where challenge.challenge_date::text = p_challenge_key
      and attempt.is_premium
      and attempt.completed_at is not null
      and attempt.correct_answers is not null
      and attempt.duration_ms is not null
      and collection.is_official
  ),
  public_ranked as (
    select
      eligible.user_id,
      row_number() over (
        order by
          eligible.correct_answers desc,
          eligible.duration_ms asc,
          eligible.completed_at asc,
          profile.display_name asc,
          eligible.user_id asc
      ) as rank
    from eligible
    join public.profiles as profile on profile.id = eligible.user_id
    where profile.leaderboard_visible
  )
  select
    public_ranked.rank,
    mine.correct_answers,
    round(
      100.0 * mine.correct_answers::numeric / nullif(mine.question_count, 0),
      2
    ),
    mine.duration_ms,
    mine.daily_points,
    profile.leaderboard_visible
  from public.profiles as profile
  left join eligible as mine on mine.user_id = profile.id
  left join public_ranked on public_ranked.user_id = profile.id
  where profile.id = (select auth.uid())
  limit 1;
$$;

create function public.get_my_global_daily_leaderboard_progress()
returns table (
  rank bigint,
  total_points bigint,
  participation_count bigint,
  correct_answers bigint,
  total_answers bigint,
  accuracy_percent numeric,
  total_duration_ms bigint,
  visible boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      attempt.user_id,
      attempt.correct_answers,
      challenge.question_count,
      attempt.duration_ms,
      public.compute_daily_leaderboard_points(
        attempt.correct_answers,
        attempt.duration_ms
      ) as daily_points
    from public.daily_challenge_attempts as attempt
    join public.daily_challenges as challenge
      on challenge.id = attempt.challenge_id
    join public.collections as collection
      on collection.id = challenge.collection_id
    where attempt.is_premium
      and attempt.completed_at is not null
      and attempt.correct_answers is not null
      and attempt.duration_ms is not null
      and collection.is_official
  ),
  totals as (
    select
      eligible.user_id,
      sum(eligible.daily_points)::bigint as total_points,
      count(*)::bigint as participation_count,
      sum(eligible.correct_answers)::bigint as correct_answers,
      sum(eligible.question_count)::bigint as total_answers,
      round(
        100.0 * sum(eligible.correct_answers)::numeric
        / nullif(sum(eligible.question_count), 0),
        2
      ) as accuracy_percent,
      sum(eligible.duration_ms)::bigint as total_duration_ms
    from eligible
    group by eligible.user_id
  ),
  public_ranked as (
    select
      totals.user_id,
      row_number() over (
        order by
          totals.total_points desc,
          totals.correct_answers desc,
          totals.total_duration_ms asc,
          totals.participation_count desc,
          totals.user_id asc
      ) as rank
    from totals
    join public.profiles as profile on profile.id = totals.user_id
    where profile.leaderboard_visible
  )
  select
    public_ranked.rank,
    coalesce(mine.total_points, 0),
    coalesce(mine.participation_count, 0),
    coalesce(mine.correct_answers, 0),
    coalesce(mine.total_answers, 0),
    mine.accuracy_percent,
    coalesce(mine.total_duration_ms, 0),
    profile.leaderboard_visible
  from public.profiles as profile
  left join totals as mine on mine.user_id = profile.id
  left join public_ranked on public_ranked.user_id = profile.id
  where profile.id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.compute_daily_leaderboard_points(integer, bigint)
  from public, anon, authenticated;
revoke all on function public.get_or_create_daily_challenge()
  from public, anon, authenticated;
revoke all on function public.get_daily_challenge_leaderboard(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.get_global_daily_leaderboard(integer, integer)
  from public, anon, authenticated;
revoke all on function public.get_my_daily_challenge_leaderboard_progress(text)
  from public, anon, authenticated;
revoke all on function public.get_my_global_daily_leaderboard_progress()
  from public, anon, authenticated;

grant execute on function public.get_or_create_daily_challenge()
  to authenticated;
grant execute on function public.get_daily_challenge_leaderboard(text, integer, integer)
  to authenticated;
grant execute on function public.get_global_daily_leaderboard(integer, integer)
  to authenticated;
grant execute on function public.get_my_daily_challenge_leaderboard_progress(text)
  to authenticated;
grant execute on function public.get_my_global_daily_leaderboard_progress()
  to authenticated;
