alter table property_manager_profiles
  alter column company_name drop not null,
  alter column verification_status set default 'verified';

update property_manager_profiles
set verification_status = 'verified',
    updated_at = now()
where verification_status = 'not_verified';

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_managed_properties_range text;
begin
  v_managed_properties_range := nullif(new.raw_user_meta_data->>'managed_properties_range', '');

  insert into profiles (
    auth_user_id,
    email,
    first_name,
    last_name,
    phone
  )
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    nullif(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (auth_user_id) do update
    set email = excluded.email
  returning id into v_profile_id;

  insert into user_roles (profile_id, role)
  values (v_profile_id, 'property_manager')
  on conflict (profile_id, role) do nothing;

  insert into property_manager_profiles (
    profile_id,
    company_name,
    managed_properties_count,
    managed_properties_range,
    primary_city,
    verification_status
  )
  values (
    v_profile_id,
    null,
    case v_managed_properties_range
      when 'starting_now' then 0
      when 'one_to_three' then 3
      when 'four_to_ten' then 10
      when 'more_than_ten' then 11
      else null
    end,
    v_managed_properties_range,
    nullif(new.raw_user_meta_data->>'primary_city', ''),
    'verified'
  )
  on conflict (profile_id) do update
    set managed_properties_count = coalesce(excluded.managed_properties_count, property_manager_profiles.managed_properties_count),
        managed_properties_range = coalesce(excluded.managed_properties_range, property_manager_profiles.managed_properties_range),
        primary_city = coalesce(excluded.primary_city, property_manager_profiles.primary_city);

  perform ensure_wallet(v_profile_id);

  return new;
end;
$$;
