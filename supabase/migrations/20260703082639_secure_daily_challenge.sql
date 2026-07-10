create table public.daily_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_date date not null unique,
  collection_id uuid not null references public.collections(id),
  category_id uuid not null references public.categories(id),
  mode text not null default 'world' check (mode = 'world'),
  question_count integer not null default 10 check (question_count = 10),
  created_at timestamptz not null default clock_timestamp()
);

create table public.daily_challenge_items (
  challenge_id uuid not null references public.daily_challenges(id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  clue_id uuid not null references public.clues(id),
  primary key (challenge_id, position),
  unique (challenge_id, clue_id)
);

create table public.daily_challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.daily_challenges(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  is_premium boolean not null,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  current_position smallint not null default 1 check (current_position between 1 and 11),
  correct_answers integer,
  duration_ms bigint,
  xp_delta integer,
  unique (challenge_id, user_id)
);

create table public.daily_attempt_steps (
  attempt_id uuid not null references public.daily_challenge_attempts(id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  is_correct boolean not null,
  answered_at timestamptz not null default clock_timestamp(),
  primary key (attempt_id, position)
);

alter table public.daily_challenges enable row level security;
alter table public.daily_challenge_items enable row level security;
alter table public.daily_challenge_attempts enable row level security;
alter table public.daily_attempt_steps enable row level security;

create policy "users can read own daily challenge attempts"
on public.daily_challenge_attempts for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.daily_challenges from public, anon, authenticated;
revoke all on public.daily_challenge_items from public, anon, authenticated;
revoke all on public.daily_challenge_attempts from public, anon, authenticated;
revoke all on public.daily_attempt_steps from public, anon, authenticated;

grant select on public.daily_challenge_attempts to authenticated;

alter table public.xp_events
  alter column training_session_id drop not null;

alter table public.xp_events
  add column if not exists daily_attempt_id uuid references public.daily_challenge_attempts(id) on delete cascade;

alter table public.xp_events
  drop constraint if exists xp_events_training_session_id_key;

drop index if exists public.xp_events_training_session_id_key;

create unique index if not exists xp_events_training_session_id_key
  on public.xp_events (training_session_id)
  where training_session_id is not null;

create unique index if not exists xp_events_daily_attempt_id_key
  on public.xp_events (daily_attempt_id)
  where daily_attempt_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.xp_events'::regclass
      and conname = 'xp_events_single_origin_check'
  ) then
    alter table public.xp_events
      add constraint xp_events_single_origin_check
      check (
        (
          case when training_session_id is null then 0 else 1 end
          + case when daily_attempt_id is null then 0 else 1 end
        ) = 1
      );
  end if;
end
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
  day_offset integer := greatest(challenge_day - date '2026-01-01', 0);
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
  selected_category_name text;
  resolved_challenge_id uuid;
  resolved_attempt_status text := 'not_started';
  resolved_status text := 'available';
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(challenge_day::text, 0));

  select challenge.id,
         challenge.collection_id,
         collection.name,
         challenge.category_id,
         category.name
  into resolved_challenge_id,
       selected_collection_id,
       selected_collection_name,
       selected_category_id,
       selected_category_name
  from public.daily_challenges as challenge
  join public.collections as collection
    on collection.id = challenge.collection_id
  join public.categories as category
    on category.id = challenge.category_id
  where challenge.challenge_date = challenge_day;

  if resolved_challenge_id is null then
    with eligible_categories as (
      select
        collection.id as collection_id,
        collection.name as collection_name,
        category.id as category_id,
        category.name as category_name,
        row_number() over (order by category.id) as category_rank,
        count(*) over () as total_count
      from public.categories as category
      join public.collections as collection
        on collection.id = category.collection_id
      join public.clues as clue
        on clue.category_id = category.id
       and clue.collection_id = collection.id
       and clue.status = 'published'
      where collection.is_official
        and exists (
          select 1
          from public.clue_images as image
          where image.clue_id = clue.id
        )
      group by collection.id, collection.name, category.id, category.name
      having count(distinct clue.id) >= 10
    )
    select eligible.collection_id,
           eligible.collection_name,
           eligible.category_id,
           eligible.category_name
    into selected_collection_id,
         selected_collection_name,
         selected_category_id,
         selected_category_name
    from eligible_categories as eligible
    where eligible.category_rank = ((day_offset % eligible.total_count) + 1);

    if selected_category_id is null then
      raise exception 'daily_challenge_unavailable'
        using errcode = 'P0001';
    end if;

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
      selected_category_id,
      'world',
      10
    )
    returning id
    into resolved_challenge_id;

    insert into public.daily_challenge_items (challenge_id, position, clue_id)
    select
      resolved_challenge_id,
      ordered.position::smallint,
      ordered.clue_id
    from (
      select
        clue.id as clue_id,
        row_number() over (
          order by md5(challenge_day::text || clue.id::text), clue.id
        ) as position
      from public.clues as clue
      where clue.category_id = selected_category_id
        and clue.collection_id = selected_collection_id
        and clue.status = 'published'
        and exists (
          select 1
          from public.clue_images as image
          where image.clue_id = clue.id
        )
      limit 10
    ) as ordered;
  end if;

  select case
           when attempt.completed_at is not null then 'completed'
           else 'in_progress'
         end
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

create or replace function public.start_daily_challenge_attempt()
returns table (
  attempt_id uuid,
  challenge_id uuid,
  challenge_key text,
  category_id uuid,
  category_name text,
  mode text,
  question_count integer,
  current_position integer,
  is_premium boolean,
  questions jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  challenge_row record;
  previous_attempt_id uuid;
  resolved_attempt public.daily_challenge_attempts%rowtype;
  premium_enabled boolean := false;
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001';
  end if;

  select *
  into challenge_row
  from public.get_or_create_daily_challenge();

  select attempt.id
  into previous_attempt_id
  from public.daily_challenge_attempts as attempt
  join public.daily_challenges as challenge
    on challenge.id = attempt.challenge_id
  where attempt.user_id = current_user_id
    and attempt.completed_at is null
    and challenge.challenge_date < challenge_row.challenge_key::date
  order by challenge.challenge_date desc
  limit 1;

  if previous_attempt_id is not null then
    raise exception 'daily_previous_attempt_in_progress'
      using errcode = 'P0001';
  end if;

  select public.has_premium_access()
  into premium_enabled;

  select attempt.*
  into resolved_attempt
  from public.daily_challenge_attempts as attempt
  where attempt.challenge_id = challenge_row.challenge_id
    and attempt.user_id = current_user_id
  for update;

  if found then
    if resolved_attempt.completed_at is not null then
      raise exception 'daily_attempt_already_completed'
        using errcode = 'P0001';
    end if;
  else
    insert into public.daily_challenge_attempts (
      challenge_id,
      user_id,
      is_premium
    )
    values (
      challenge_row.challenge_id,
      current_user_id,
      premium_enabled
    )
    returning *
    into resolved_attempt;
  end if;

  return query
  with question_rows as (
    select
      item.position::integer as position,
      clue.id as clue_id,
      image.storage_path as image_storage_path,
      coalesce(image.alt_text, country.name, clue.country_code) as image_alt,
      clue.difficulty::text as difficulty,
      category.name as category_name,
      category.icon as category_icon
    from public.daily_challenge_items as item
    join public.clues as clue
      on clue.id = item.clue_id
    join public.categories as category
      on category.id = clue.category_id
    join public.countries as country
      on country.code = clue.country_code
    join lateral (
      select clue_image.storage_path, clue_image.alt_text
      from public.clue_images as clue_image
      where clue_image.clue_id = clue.id
      order by clue_image.sort_order asc, clue_image.id asc
      limit 1
    ) as image on true
    where item.challenge_id = challenge_row.challenge_id
    order by item.position
  )
  select
    resolved_attempt.id,
    challenge_row.challenge_id,
    challenge_row.challenge_key,
    challenge_row.category_id,
    challenge_row.category_name,
    challenge_row.mode,
    challenge_row.question_count,
    resolved_attempt.current_position::integer,
    resolved_attempt.is_premium,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'position', question.position,
          'clue_id', question.clue_id,
          'image_storage_path', question.image_storage_path,
          'image_alt', question.image_alt,
          'difficulty', question.difficulty,
          'category_name', question.category_name,
          'category_icon', question.category_icon
        )
        order by question.position
      ),
      '[]'::jsonb
    )
  from question_rows as question;
end;
$$;

create or replace function public.submit_daily_challenge_answer(
  p_attempt_id uuid,
  p_position smallint,
  p_selected_code text
)
returns table (
  "position" integer,
  selected_code text,
  selected_label text,
  correct_code text,
  correct_label text,
  is_correct boolean,
  completed boolean,
  current_position integer,
  correct_answers integer,
  total_questions integer,
  duration_ms bigint,
  xp_delta integer,
  xp_total bigint,
  xp_awarded boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  attempt_row public.daily_challenge_attempts%rowtype;
  challenge_row public.daily_challenges%rowtype;
  clue_row record;
  answer_correct boolean := false;
  selected_country_name text := null;
  correct_count integer := 0;
  total_delta integer := 0;
  before_xp bigint := 0;
  after_xp bigint := 0;
  completion_time timestamptz := clock_timestamp();
  final_duration_ms bigint := null;
  final_completed boolean := false;
  awarded_xp boolean := false;
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001';
  end if;

  select attempt.*
  into attempt_row
  from public.daily_challenge_attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.user_id = current_user_id
  for update;

  if not found then
    raise exception 'daily_attempt_not_found'
      using errcode = 'P0001';
  end if;

  if attempt_row.completed_at is not null then
    raise exception 'daily_attempt_already_completed'
      using errcode = 'P0001';
  end if;

  if attempt_row.current_position <> p_position then
    raise exception 'daily_answer_position_invalid'
      using errcode = 'P0001';
  end if;

  select challenge.*
  into challenge_row
  from public.daily_challenges as challenge
  where challenge.id = attempt_row.challenge_id;

  select
    clue.id,
    clue.country_code,
    country.name as country_name,
    clue.difficulty
  into clue_row
  from public.daily_challenge_items as item
  join public.clues as clue
    on clue.id = item.clue_id
  join public.countries as country
    on country.code = clue.country_code
  where item.challenge_id = attempt_row.challenge_id
    and item.position = p_position;

  if clue_row.id is null then
    raise exception 'daily_answer_not_found'
      using errcode = 'P0001';
  end if;

  select country.name
  into selected_country_name
  from public.countries as country
  where country.code = p_selected_code;

  answer_correct := clue_row.country_code = p_selected_code;

  insert into public.daily_attempt_steps (attempt_id, position, is_correct)
  values (attempt_row.id, p_position, answer_correct);

  update public.daily_challenge_attempts as attempt
  set current_position = least(11, attempt.current_position + 1)
  where attempt.id = attempt_row.id
  returning *
  into attempt_row;

  if p_position = 10 then
    final_completed := true;
    final_duration_ms := greatest(
      1,
      floor(
        extract(epoch from (completion_time - attempt_row.started_at)) * 1000
      )::bigint
    );

    select count(*)::integer
    into correct_count
    from public.daily_attempt_steps as step
    where step.attempt_id = attempt_row.id
      and step.is_correct;

    if attempt_row.is_premium then
      select profile.xp_total
      into before_xp
      from public.profiles as profile
      where profile.id = current_user_id
      for update;

      select
        coalesce(sum(public.compute_ranked_answer_xp(clue.difficulty, step.is_correct)), 0)::integer + 10
      into total_delta
      from public.daily_attempt_steps as step
      join public.daily_challenge_items as item
        on item.challenge_id = attempt_row.challenge_id
       and item.position = step.position
      join public.clues as clue
        on clue.id = item.clue_id
      where step.attempt_id = attempt_row.id;

      after_xp := greatest(0::bigint, before_xp + total_delta::bigint);

      insert into public.xp_events (
        user_id,
        training_session_id,
        daily_attempt_id,
        total_delta,
        correct_count,
        wrong_count,
        before_xp,
        after_xp
      )
      values (
        current_user_id,
        null,
        attempt_row.id,
        total_delta,
        correct_count,
        10 - correct_count,
        before_xp,
        after_xp
      )
      on conflict (daily_attempt_id) do nothing;

      if found then
        awarded_xp := true;
        update public.profiles as profile
        set xp_total = after_xp,
            updated_at = timezone('utc', now())
        where profile.id = current_user_id;
      else
        select profile.xp_total
        into after_xp
        from public.profiles as profile
        where profile.id = current_user_id;
      end if;

      update public.daily_challenge_attempts as attempt
      set completed_at = completion_time,
          correct_answers = correct_count,
          duration_ms = final_duration_ms,
          xp_delta = total_delta,
          current_position = 11
      where attempt.id = attempt_row.id
      returning *
      into attempt_row;
    else
      update public.daily_challenge_attempts as attempt
      set completed_at = completion_time,
          current_position = 11
      where attempt.id = attempt_row.id
      returning *
      into attempt_row;

      delete from public.daily_attempt_steps as step
      where step.attempt_id = attempt_row.id;
    end if;
  else
    select count(*)::integer
    into correct_count
    from public.daily_attempt_steps as step
    where step.attempt_id = attempt_row.id
      and step.is_correct;
  end if;

  return query
  select
    p_position::integer,
    p_selected_code,
    coalesce(selected_country_name, p_selected_code),
    clue_row.country_code::text,
    clue_row.country_name::text,
    answer_correct,
    final_completed,
    attempt_row.current_position::integer,
    correct_count,
    challenge_row.question_count,
    case when attempt_row.is_premium then final_duration_ms else null end,
    case when attempt_row.is_premium then total_delta else 0 end,
    case when attempt_row.is_premium then after_xp else null end,
    awarded_xp;
end;
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
  with eligible_rows as (
    select
      attempt.user_id,
      profile.display_name as username,
      profile.avatar_url,
      profile.xp_total,
      round(
        100.0 * attempt.correct_answers::numeric / nullif(challenge.question_count, 0),
        2
      ) as accuracy_percent,
      attempt.duration_ms,
      attempt.completed_at,
      1::bigint as quiz_count
    from public.daily_challenge_attempts as attempt
    join public.daily_challenges as challenge
      on challenge.id = attempt.challenge_id
    join public.profiles as profile
      on profile.id = attempt.user_id
    where challenge.collection_id = p_collection_id
      and challenge.category_id = p_category_id
      and challenge.challenge_date::text = p_challenge_key
      and attempt.is_premium
      and attempt.completed_at is not null
      and attempt.correct_answers is not null
      and attempt.duration_ms is not null
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
    from eligible_rows as row
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
    select profile.id, profile.leaderboard_visible
    from public.profiles as profile
    where profile.id = auth.uid()
  ),
  eligible_attempt as (
    select
      attempt.user_id,
      round(
        100.0 * attempt.correct_answers::numeric / nullif(challenge.question_count, 0),
        2
      ) as accuracy_percent,
      attempt.duration_ms,
      1::bigint as completed_sessions
    from public.daily_challenge_attempts as attempt
    join public.daily_challenges as challenge
      on challenge.id = attempt.challenge_id
    where challenge.collection_id = p_collection_id
      and challenge.category_id = p_category_id
      and challenge.challenge_date::text = p_challenge_key
      and attempt.user_id = auth.uid()
      and attempt.is_premium
      and attempt.completed_at is not null
      and attempt.correct_answers is not null
      and attempt.duration_ms is not null
  ),
  visible_rows as (
    select
      attempt.user_id,
      profile.display_name as username,
      round(
        100.0 * attempt.correct_answers::numeric / nullif(challenge.question_count, 0),
        2
      ) as accuracy_percent,
      attempt.duration_ms,
      attempt.completed_at
    from public.daily_challenge_attempts as attempt
    join public.daily_challenges as challenge
      on challenge.id = attempt.challenge_id
    join public.profiles as profile
      on profile.id = attempt.user_id
    where challenge.collection_id = p_collection_id
      and challenge.category_id = p_category_id
      and challenge.challenge_date::text = p_challenge_key
      and attempt.is_premium
      and attempt.completed_at is not null
      and attempt.correct_answers is not null
      and attempt.duration_ms is not null
      and profile.leaderboard_visible
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
    coalesce(attempt.completed_sessions, 0),
    coalesce(profile.leaderboard_visible, false)
  from current_profile as profile
  left join eligible_attempt as attempt
    on attempt.user_id = profile.id
  left join ranked_rows as ranked
    on ranked.user_id = profile.id
  limit 1;
$$;

revoke all on function public.get_or_create_daily_challenge() from public, anon, authenticated;
revoke all on function public.start_daily_challenge_attempt() from public, anon, authenticated;
revoke all on function public.submit_daily_challenge_answer(uuid, smallint, text) from public, anon, authenticated;
revoke all on function public.get_daily_challenge_leaderboard(uuid, uuid, text, integer, integer) from public, anon;
revoke all on function public.get_my_daily_challenge_leaderboard_progress(uuid, uuid, text) from public, anon;

grant execute on function public.get_or_create_daily_challenge() to authenticated;
grant execute on function public.start_daily_challenge_attempt() to authenticated;
grant execute on function public.submit_daily_challenge_answer(uuid, smallint, text) to authenticated;
grant execute on function public.get_daily_challenge_leaderboard(uuid, uuid, text, integer, integer) to authenticated;
grant execute on function public.get_my_daily_challenge_leaderboard_progress(uuid, uuid, text) to authenticated;
