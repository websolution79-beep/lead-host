begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Service-only read API. Auth metadata is projected to two legacy signup fields;
-- no auth credentials or metadata documents are exposed to the application.
create or replace function public.admin_pm_list_page_v1(
  p_search text default '',
  p_managed_properties text default null,
  p_page integer default 1,
  p_page_size integer default 25
) returns jsonb
language sql stable security definer
set search_path = ''
as $function$
with role_ids as materialized (
  select distinct profile_id from public.user_roles where role::text = 'property_manager'
), base as materialized (
  select r.profile_id, p.id, p.email, p.first_name, p.last_name, p.phone,
    p.avatar_url, p.status::text as profile_status, p.created_at,
    coalesce(pm.verification_status::text, 'not_verified') as verification_status,
    coalesce(pm.managed_properties_range, u.raw_user_meta_data->>'managed_properties_range') as effective_range,
    coalesce(pm.primary_city, u.raw_user_meta_data->>'primary_city', '') as effective_city,
    pm.managed_properties_count,
    exists (
      select 1 from public.prime_accounts pa where pa.profile_id = r.profile_id
        and pa.status::text = 'active'
        and (pa.prime_expires_at is null or pa.prime_expires_at > now())
    ) as prime_active
  from role_ids r
  left join public.profiles p on p.id = r.profile_id
  left join public.property_manager_profiles pm on pm.profile_id = r.profile_id
  left join auth.users u on u.id = p.auth_user_id
), filtered as materialized (
  select * from base where id is not null
    and (coalesce(p_search, '') = '' or exists (
      select 1 from unnest(array[first_name, last_name,
        concat_ws(' ', nullif(first_name, ''), nullif(last_name, '')),
        email, phone, effective_city]) as field(value)
      where strpos(lower(field.value), lower(p_search)) > 0
    ))
    and (p_managed_properties is null
      or (p_managed_properties = 'not_indicated' and nullif(effective_range, '') is null)
      or effective_range = p_managed_properties)
), page_rows as (
  select * from filtered order by created_at desc, id desc
  limit least(greatest(coalesce(p_page_size, 25), 1), 50)
  offset ((greatest(coalesce(p_page, 1), 1)::bigint - 1)
    * least(greatest(coalesce(p_page_size, 25), 1), 50))
)
select jsonb_build_object(
  'total', (select count(*) from filtered),
  'stats', (select jsonb_build_object(
    'total', count(*),
    'active', count(*) filter (where profile_status = 'active' and verification_status <> 'suspended'),
    'suspended', count(*) - count(*) filter (where profile_status = 'active' and verification_status <> 'suspended'),
    'prime', count(*) filter (where profile_status = 'active' and verification_status <> 'suspended' and prime_active)
  ) from base),
  'propertyManagers', coalesce((select jsonb_agg(jsonb_build_object(
    'profileId', p.id, 'email', p.email, 'firstName', p.first_name,
    'lastName', p.last_name, 'phone', p.phone, 'avatarUrl', p.avatar_url,
    'profileStatus', p.profile_status, 'verificationStatus', p.verification_status,
    'managedPropertiesRange', p.effective_range,
    'managedPropertiesCount', p.managed_properties_count,
    'primaryCity', coalesce(nullif(p.effective_city, ''), 'Non indicata'),
    'walletBalanceCents', coalesce(w.balance_cents, 0),
    'walletCurrency', coalesce(w.currency, 'eur'), 'createdAt', p.created_at
  ) order by p.created_at desc, p.id desc)
    from page_rows p left join public.wallets w on w.profile_id = p.id), '[]'::jsonb)
);
$function$;

revoke all on function public.admin_pm_list_page_v1(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.admin_pm_list_page_v1(text,text,integer,integer) to service_role;
notify pgrst, 'reload schema';
commit;
