drop index if exists public.xp_events_daily_attempt_id_key;

create unique index xp_events_daily_attempt_id_key
  on public.xp_events (daily_attempt_id);

drop function if exists public.start_daily_challenge_attempt();

create function public.start_daily_challenge_attempt()
returns table (
  attempt_id uuid,
  challenge_id uuid,
  challenge_key text,
  collection_id uuid,
  collection_name text,
  category_id uuid,
  category_name text,
  mode text,
  question_count integer,
  current_position integer,
  is_premium boolean,
  started_at timestamptz,
  answered_steps jsonb,
  questions jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  challenge_row record;
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
    challenge_row.collection_id,
    challenge_row.collection_name,
    challenge_row.category_id,
    challenge_row.category_name,
    challenge_row.mode,
    challenge_row.question_count,
    resolved_attempt.current_position::integer,
    resolved_attempt.is_premium,
    resolved_attempt.started_at,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'position', step.position,
            'is_correct', step.is_correct
          )
          order by step.position
        ),
        '[]'::jsonb
      )
      from public.daily_attempt_steps as step
      where step.attempt_id = resolved_attempt.id
    ),
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

revoke all on function public.start_daily_challenge_attempt() from public, anon, authenticated;
grant execute on function public.start_daily_challenge_attempt() to authenticated;
