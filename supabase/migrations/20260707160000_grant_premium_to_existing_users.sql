-- Grant permanent premium access to every account that exists when this
-- migration runs. Future registrations remain on the free plan.
insert into public.billing_feature_entitlements (
  user_id,
  feature_key,
  source,
  expires_at
)
select
  profile.id,
  'premium',
  'admin'::public.billing_feature_source,
  null
from public.profiles as profile
on conflict (user_id, feature_key, source)
do update set
  expires_at = null,
  updated_at = timezone('utc', now());
