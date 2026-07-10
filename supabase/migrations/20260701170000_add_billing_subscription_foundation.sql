create type public.billing_plan_key as enum (
  'free',
  'premium_monthly',
  'premium_yearly'
);

create type public.billing_subscription_status as enum (
  'inactive',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid'
);

create type public.billing_feature_source as enum (
  'manual',
  'promo',
  'admin'
);

create table public.billing_customers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id text unique,
  checkout_email text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_customers_checkout_email_length
    check (checkout_email is null or char_length(btrim(checkout_email)) between 3 and 320)
);

create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan_key public.billing_plan_key not null default 'free',
  status public.billing_subscription_status not null default 'inactive',
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_subscriptions_period_order
    check (
      current_period_start is null
      or current_period_end is null
      or current_period_end >= current_period_start
    ),
  constraint billing_subscriptions_trial_end_order
    check (
      trial_end is null
      or current_period_start is null
      or trial_end >= current_period_start
    )
);

create index billing_subscriptions_user_idx
  on public.billing_subscriptions (user_id, created_at desc);

create index billing_subscriptions_user_status_idx
  on public.billing_subscriptions (user_id, status, current_period_end desc);

create table public.billing_feature_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature_key text not null,
  source public.billing_feature_source not null,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_feature_entitlements_feature_key_not_blank
    check (char_length(btrim(feature_key)) between 1 and 80)
);

create unique index billing_feature_entitlements_unique_active_idx
  on public.billing_feature_entitlements (user_id, feature_key, source);

create index billing_feature_entitlements_user_idx
  on public.billing_feature_entitlements (user_id, feature_key, expires_at);

create trigger billing_customers_set_updated_at
before update on public.billing_customers
for each row execute function public.set_updated_at();

create trigger billing_subscriptions_set_updated_at
before update on public.billing_subscriptions
for each row execute function public.set_updated_at();

create trigger billing_feature_entitlements_set_updated_at
before update on public.billing_feature_entitlements
for each row execute function public.set_updated_at();

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_feature_entitlements enable row level security;

drop policy if exists "users can read own billing subscriptions" on public.billing_subscriptions;
create policy "users can read own billing subscriptions"
on public.billing_subscriptions for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users can read own billing feature entitlements" on public.billing_feature_entitlements;
create policy "users can read own billing feature entitlements"
on public.billing_feature_entitlements for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.billing_customers from public, anon, authenticated;
revoke all on public.billing_subscriptions from public, anon;
revoke all on public.billing_feature_entitlements from public, anon;
grant select on public.billing_subscriptions to authenticated;
grant select on public.billing_feature_entitlements to authenticated;

create or replace function public.has_premium_access()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with current_account as (
    select auth.uid() as id
  )
  select
    coalesce(
      exists (
        select 1
        from public.billing_subscriptions as subscription
        join current_account on current_account.id = subscription.user_id
        where subscription.plan_key in ('premium_monthly', 'premium_yearly')
          and subscription.status in ('trialing', 'active', 'past_due')
          and (
            subscription.current_period_end is null
            or subscription.current_period_end > clock_timestamp()
          )
      ),
      false
    )
    or coalesce(
      exists (
        select 1
        from public.billing_feature_entitlements as entitlement
        join current_account on current_account.id = entitlement.user_id
        where entitlement.feature_key = 'premium'
          and (
            entitlement.expires_at is null
            or entitlement.expires_at > clock_timestamp()
          )
      ),
      false
    );
$$;

create or replace function public.get_my_billing_status()
returns table (
  plan_key public.billing_plan_key,
  status public.billing_subscription_status,
  cancel_at_period_end boolean,
  current_period_end timestamptz,
  premium_enabled boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ranked_subscriptions as (
    select
      subscription.plan_key,
      subscription.status,
      subscription.cancel_at_period_end,
      subscription.current_period_end,
      row_number() over (
        order by
          case
            when subscription.status in ('trialing', 'active', 'past_due') then 0
            else 1
          end,
          coalesce(subscription.current_period_end, subscription.created_at) desc,
          subscription.created_at desc,
          subscription.id desc
      ) as row_rank
    from public.billing_subscriptions as subscription
    where subscription.user_id = auth.uid()
  ),
  current_subscription as (
    select
      plan_key,
      status,
      cancel_at_period_end,
      current_period_end
    from ranked_subscriptions
    where row_rank = 1
  )
  select
    coalesce(
      (select current_subscription.plan_key from current_subscription),
      'free'::public.billing_plan_key
    ) as plan_key,
    coalesce(
      (select current_subscription.status from current_subscription),
      'inactive'::public.billing_subscription_status
    ) as status,
    coalesce(
      (select current_subscription.cancel_at_period_end from current_subscription),
      false
    ) as cancel_at_period_end,
    (select current_subscription.current_period_end from current_subscription) as current_period_end,
    public.has_premium_access() as premium_enabled;
$$;

revoke all on function public.has_premium_access() from public, anon;
revoke all on function public.get_my_billing_status() from public, anon;
grant execute on function public.has_premium_access() to authenticated;
grant execute on function public.get_my_billing_status() to authenticated;
