insert into settings (key, value)
values
  ('lead.availability_days', '7'::jsonb),
  ('lead.sold_visibility_days', '7'::jsonb)
on conflict (key) do nothing;

alter table leads
  add column if not exists sold_at timestamptz,
  add column if not exists sold_visible_until timestamptz;

create index if not exists leads_sold_visibility_idx
  on leads (internal_status, sold_visible_until)
  where internal_status in ('sold_two_pm', 'sold_exclusive');

create or replace function lead_setting_days(
  p_key text,
  p_default integer,
  p_minimum integer default 0
)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_value jsonb;
  v_days integer;
begin
  select settings.value
  into v_value
  from settings
  where settings.key = p_key;

  if jsonb_typeof(v_value) = 'number' then
    v_days := (v_value #>> '{}')::integer;
  elsif jsonb_typeof(v_value) = 'string' then
    v_days := nullif(trim(both '"' from v_value::text), '')::integer;
  end if;

  return greatest(coalesce(v_days, p_default), p_minimum);
exception
  when others then
    return greatest(p_default, p_minimum);
end;
$$;

create or replace function lead_availability_days()
returns integer
language sql
stable
set search_path = public
as $$
  select lead_setting_days('lead.availability_days', 7, 1);
$$;

create or replace function lead_sold_visibility_days()
returns integer
language sql
stable
set search_path = public
as $$
  select lead_setting_days('lead.sold_visibility_days', 7, 0);
$$;

create or replace function lead_unavailable_visible_until(
  p_now timestamptz default now()
)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select coalesce(p_now, now())
    + make_interval(days => lead_setting_days('lead.unavailable_visibility_days', 7, 0));
$$;

create or replace function set_lead_unavailable_visible_until()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if
    new.internal_status in ('sold_two_pm', 'sold_exclusive')
    and old.internal_status is distinct from new.internal_status
  then
    new.sold_at := coalesce(new.sold_at, now());
    new.sold_visible_until := new.sold_at
      + make_interval(days => lead_sold_visibility_days());
    new.visible_until := null;
  elsif
    new.internal_status = 'withdrawn_after_7_days'
    and old.internal_status is distinct from 'withdrawn_after_7_days'
  then
    new.visible_until := lead_unavailable_visible_until(new.expires_at);
    new.sold_at := null;
    new.sold_visible_until := null;
  end if;

  return new;
end;
$$;

drop trigger if exists leads_unavailable_visible_until on leads;
create trigger leads_unavailable_visible_until
before update on leads
for each row
execute function set_lead_unavailable_visible_until();

create or replace function publish_lead(p_lead_id uuid)
returns leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead leads;
begin
  update leads
  set
    internal_status = 'available',
    public_status = 'available',
    published_at = now(),
    expires_at = now() + make_interval(days => lead_availability_days()),
    visible_until = null,
    sold_at = null,
    sold_visible_until = null
  where id = p_lead_id
  returning * into v_lead;

  if not found then
    raise exception 'lead_not_found';
  end if;

  return v_lead;
end;
$$;

with sold_dates as (
  select
    leads.id,
    coalesce(
      leads.sold_at,
      max(lead_purchases.created_at),
      leads.updated_at
    ) as sold_at
  from leads
  left join lead_purchases on lead_purchases.lead_id = leads.id
  where leads.internal_status in ('sold_two_pm', 'sold_exclusive')
  group by leads.id, leads.sold_at, leads.updated_at
)
update leads
set
  sold_at = sold_dates.sold_at,
  sold_visible_until = coalesce(
    leads.sold_visible_until,
    sold_dates.sold_at + make_interval(days => lead_sold_visibility_days())
  )
from sold_dates
where leads.id = sold_dates.id;

update leads
set visible_until = lead_unavailable_visible_until(expires_at)
where internal_status = 'withdrawn_after_7_days'
  and visible_until is null;

revoke execute on function lead_setting_days(text, integer, integer)
  from public, anon, authenticated;
revoke execute on function lead_availability_days()
  from public, anon, authenticated;
revoke execute on function lead_sold_visibility_days()
  from public, anon, authenticated;
revoke execute on function lead_unavailable_visible_until(timestamptz)
  from public, anon, authenticated;
grant execute on function lead_availability_days() to service_role;
grant execute on function lead_sold_visibility_days() to service_role;
grant execute on function lead_unavailable_visible_until(timestamptz) to service_role;
