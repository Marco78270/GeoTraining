alter table public.profiles
  add column if not exists xp_total bigint;

update public.profiles
set xp_total = 0
where xp_total is null;

alter table public.profiles
  alter column xp_total set default 0,
  alter column xp_total set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_xp_total_safe_integer_check'
  ) then
    alter table public.profiles
      add constraint profiles_xp_total_safe_integer_check
      check (xp_total between 0::bigint and 9007199254740991::bigint);
  end if;
end
$$;

create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  training_session_id uuid not null references public.training_sessions(id) on delete cascade,
  total_delta integer not null,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  before_xp bigint not null,
  after_xp bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (training_session_id)
);

update public.xp_events
set correct_count = coalesce(correct_count, 0),
    wrong_count = coalesce(wrong_count, 0),
    created_at = coalesce(created_at, timezone('utc', now()))
where correct_count is null
   or wrong_count is null
   or created_at is null;

alter table public.xp_events
  alter column user_id set not null,
  alter column training_session_id set not null,
  alter column total_delta set not null,
  alter column correct_count set default 0,
  alter column correct_count set not null,
  alter column wrong_count set default 0,
  alter column wrong_count set not null,
  alter column before_xp set not null,
  alter column after_xp set not null,
  alter column created_at set default timezone('utc', now()),
  alter column created_at set not null;

do $$
declare
  training_session_id_attnum text;
begin
  select attnum::text
  into training_session_id_attnum
  from pg_attribute
  where attrelid = 'public.xp_events'::regclass
    and attname = 'training_session_id'
    and not attisdropped;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.xp_events'::regclass
      and contype = 'u'
      and array_length(conkey, 1) = 1
      and conkey[1] = training_session_id_attnum::smallint
  ) and not exists (
    select 1
    from pg_index
    where indrelid = 'public.xp_events'::regclass
      and indisunique
      and indpred is null
      and indnkeyatts = 1
      and indkey::text = training_session_id_attnum
  ) then
    create unique index xp_events_training_session_id_key
      on public.xp_events (training_session_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.xp_events'::regclass
      and conname = 'xp_events_before_xp_safe_integer_check'
  ) then
    alter table public.xp_events
      add constraint xp_events_before_xp_safe_integer_check
      check (before_xp between 0::bigint and 9007199254740991::bigint);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.xp_events'::regclass
      and conname = 'xp_events_after_xp_safe_integer_check'
  ) then
    alter table public.xp_events
      add constraint xp_events_after_xp_safe_integer_check
      check (after_xp between 0::bigint and 9007199254740991::bigint);
  end if;
end
$$;

create or replace function public.compute_ranked_answer_xp(
  p_difficulty public.clue_difficulty,
  p_is_correct boolean
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_difficulty = 'easy' and p_is_correct then 6
    when p_difficulty = 'easy' and not p_is_correct then -9
    when p_difficulty = 'medium' and p_is_correct then 10
    when p_difficulty = 'medium' and not p_is_correct then -10
    when p_difficulty = 'expert' and p_is_correct then 15
    when p_difficulty = 'expert' and not p_is_correct then -6
    else 0
  end
$$;

drop function if exists public.complete_training_session(uuid);

create function public.complete_training_session(p_session_id uuid)
returns table (
  id uuid,
  user_id uuid,
  collection_id uuid,
  mode public.training_mode,
  country_code text,
  category_id uuid,
  total_questions integer,
  is_ranked boolean,
  challenge_type text,
  challenge_key text,
  duration_ms bigint,
  correct_answers integer,
  total_answers integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
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
  existing_session public.training_sessions%rowtype;
  completed_session public.training_sessions%rowtype;
  answer_count integer := 0;
  correct_count integer := 0;
  wrong_count integer := 0;
  total_delta integer := 0;
  before_xp bigint := 0;
  after_xp bigint := 0;
  completed_at_ts timestamptz := clock_timestamp();
  session_is_official boolean := false;
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001';
  end if;

  select session.*
  into existing_session
  from public.training_sessions as session
  where session.id = p_session_id
    and session.user_id = current_user_id
  for update of session;

  if not found then
    raise exception 'training_session_not_found'
      using errcode = 'P0001';
  end if;

  select collection.is_official
  into session_is_official
  from public.collections as collection
  where collection.id = existing_session.collection_id;

  if existing_session.completed_at is null then
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
  else
    completed_session := existing_session;
  end if;

  if completed_session.is_ranked
    and completed_session.total_answers > 0
    and completed_session.challenge_type in ('standard', 'daily')
    and completed_session.collection_id is not null
    and completed_session.category_id is not null
    and coalesce(completed_session.duration_ms, 0) > 0
    and session_is_official then
    select
      coalesce(sum(public.compute_ranked_answer_xp(clue.difficulty, answer.is_correct)), 0)::integer,
      count(*) filter (where answer.is_correct)::integer,
      count(*) filter (where not answer.is_correct)::integer
    into total_delta, correct_count, wrong_count
    from public.training_answers as answer
    join public.clues as clue
      on clue.id = answer.clue_id
    where answer.session_id = p_session_id
      and answer.user_id = current_user_id;

    select profile.xp_total
    into before_xp
    from public.profiles as profile
    where profile.id = completed_session.user_id
    for update;

    after_xp := greatest(0::bigint, before_xp + total_delta::bigint);

    insert into public.xp_events (
      user_id,
      training_session_id,
      total_delta,
      correct_count,
      wrong_count,
      before_xp,
      after_xp
    )
    values (
      completed_session.user_id,
      p_session_id,
      total_delta,
      correct_count,
      wrong_count,
      before_xp,
      after_xp
    )
    on conflict (training_session_id) do nothing;

    if found then
      update public.profiles as profile
      set xp_total = after_xp,
          updated_at = timezone('utc', now())
      where profile.id = completed_session.user_id;
    end if;
  end if;

  return query
  select
    session.id,
    session.user_id,
    session.collection_id,
    session.mode,
    session.country_code,
    session.category_id,
    session.total_questions,
    session.is_ranked,
    session.challenge_type,
    session.challenge_key,
    session.duration_ms,
    session.correct_answers,
    session.total_answers,
    session.started_at,
    session.completed_at,
    session.created_at,
    session.updated_at,
    coalesce(event.total_delta, 0) as xp_delta,
    profile.xp_total,
    (event.id is not null) as xp_awarded
  from public.training_sessions as session
  join public.profiles as profile
    on profile.id = session.user_id
  left join public.xp_events as event
    on event.training_session_id = session.id
  where session.id = p_session_id
    and session.user_id = current_user_id;
end;
$$;

alter table public.xp_events enable row level security;

create policy "users can read own xp events"
on public.xp_events
for select
to authenticated
using (auth.uid() = user_id);

revoke all on public.xp_events from public, anon, authenticated;
grant select on public.xp_events to authenticated;

revoke all on function public.complete_training_session(uuid) from public, anon;
grant execute on function public.complete_training_session(uuid) to authenticated;
