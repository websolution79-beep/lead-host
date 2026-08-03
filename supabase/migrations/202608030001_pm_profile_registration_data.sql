alter table public.property_manager_profiles
  add column if not exists managed_properties_range text,
  add column if not exists primary_city text;

-- Preserve the onboarding data already collected in Auth metadata for PMs
-- created before these profile columns were available.
update public.property_manager_profiles as pm
set
  managed_properties_range = coalesce(
    pm.managed_properties_range,
    nullif(trim(u.raw_user_meta_data ->> 'managed_properties_range'), '')
  ),
  primary_city = coalesce(
    pm.primary_city,
    nullif(trim(u.raw_user_meta_data ->> 'primary_city'), '')
  ),
  managed_properties_count = coalesce(
    pm.managed_properties_count,
    case u.raw_user_meta_data ->> 'managed_properties_range'
      when 'starting_now' then 0
      when 'one_to_three' then 3
      when 'four_to_ten' then 10
      when 'more_than_ten' then 11
      else null
    end
  ),
  updated_at = now()
from public.profiles p
join auth.users u on u.id = p.auth_user_id
where p.id = pm.profile_id
  and (
    pm.managed_properties_range is null
    or pm.primary_city is null
    or pm.managed_properties_count is null
  );
