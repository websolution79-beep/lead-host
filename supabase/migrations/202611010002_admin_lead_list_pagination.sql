begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Additive read-only API; existing pipeline readers are not changed.
create or replace function public.admin_lead_list_page_v1(
  p_filter text default 'all', p_search text default '',
  p_page integer default 1, p_page_size integer default 25
) returns jsonb
language sql stable security definer
set search_path = ''
as $function$
with purchase_ids as materialized (
  select distinct lead_id from public.lead_purchases where status::text in ('paid','contact_unlocked')
), lead_flags as materialized (
  select l.*,
    (l.visibility_mode::text = 'prime_private' and l.internal_status::text = 'available'
      and l.prime_access_until > now()) as active_prime,
    (l.published_at is not null and case
      when l.internal_status::text in ('available','one_slot_sold') then l.expires_at > now()
      when l.internal_status::text = 'withdrawn_after_7_days' then l.visible_until >= now()
      when l.internal_status::text in ('sold_two_pm','sold_exclusive') then l.sold_visible_until >= now()
      else false end) as marketplace_visible,
    (l.internal_status::text = 'withdrawn_after_7_days'
      or (l.internal_status::text in ('available','one_slot_sold') and l.expires_at <= now())) as expired,
    exists(select 1 from purchase_ids p where p.lead_id = l.id) as purchased
  from public.leads l
), base as materialized (
  select r.id, r.created_at, r.status::text as request_status,
    (r.status::text not in ('published','not_publishable')
      and r.duplicate_check->>'status' in ('duplicate','possible_duplicate')) as duplicate,
    l.visibility_mode::text as visibility_mode,
    l.marketplace_visible, l.expired, l.purchased,
    lower(concat_ws(' ', nullif(c.first_name,''), nullif(c.last_name,''),
      nullif(c.email,''), nullif(c.phone,''), nullif(p.city,''), nullif(p.province,''),
      nullif(p.region,''), nullif(p.property_type::text,''), nullif(p.description,''), nullif(l.title,''))) as search_text
  from public.owner_requests r
  left join public.owner_contacts c on c.owner_request_id = r.id
  left join public.properties p on p.owner_request_id = r.id
  left join lead_flags l on l.owner_request_id = r.id
), filtered as materialized (
  select id, created_at from base where
    (coalesce(p_search,'') = '' or strpos(search_text, lower(trim(p_search))) > 0)
    and case p_filter
      when 'all' then true
      when 'completion' then request_status = 'waiting_for_completion'
      when 'duplicates' then duplicate
      when 'pending' then request_status = 'pending'
      when 'prime' then visibility_mode = 'prime_private'
      when 'published' then marketplace_visible
      when 'sold' then purchased
      when 'expired' then expired
      when 'rejected' then request_status = 'not_publishable'
      else false end
), page_rows as (
  select id, created_at from filtered order by created_at desc, id desc
  limit least(greatest(coalesce(p_page_size,25),1),50)
  offset ((greatest(coalesce(p_page,1),1)::bigint - 1) * least(greatest(coalesce(p_page_size,25),1),50))
)
select jsonb_build_object(
  'ownerRequestIds', coalesce((select jsonb_agg(id order by created_at desc,id desc) from page_rows),'[]'::jsonb),
  'total', (select count(*) from filtered),
  'stats', jsonb_build_object(
    'waitingCompletion', (select count(*) from base where request_status = 'waiting_for_completion'),
    'duplicates', (select count(*) from base where duplicate),
    'newLeads', (select count(*) from base where request_status = 'to_verify'),
    'pending', (select count(*) from base where request_status = 'pending'),
    'prime', (select count(*) from lead_flags where active_prime),
    'published', (select count(*) from lead_flags where marketplace_visible),
    'sold', (select count(*) from purchase_ids),
    'expired', (select count(*) from lead_flags where expired),
    'rejected', (select count(*) from base where request_status = 'not_publishable')
  )
);
$function$;

revoke all on function public.admin_lead_list_page_v1(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.admin_lead_list_page_v1(text,text,integer,integer) to service_role;
notify pgrst, 'reload schema';
commit;
