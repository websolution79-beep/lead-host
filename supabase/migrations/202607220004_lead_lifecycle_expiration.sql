insert into settings (key, value)
values ('lead.unavailable_visibility_days', '7'::jsonb)
on conflict (key) do nothing;

create or replace function lead_unavailable_visibility_days()
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
  where settings.key = 'lead.unavailable_visibility_days';

  if jsonb_typeof(v_value) = 'number' then
    v_days := (v_value #>> '{}')::integer;
  elsif jsonb_typeof(v_value) = 'string' then
    v_days := nullif(trim(both '"' from v_value::text), '')::integer;
  else
    v_days := 7;
  end if;

  return greatest(coalesce(v_days, 7), 0);
exception
  when others then
    return 7;
end;
$$;

create or replace function lead_unavailable_visible_until(p_now timestamptz default now())
returns timestamptz
language sql
stable
set search_path = public
as $$
  select p_now + make_interval(days => lead_unavailable_visibility_days());
$$;

create or replace function set_lead_unavailable_visible_until()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if
    new.public_status = 'unavailable'
    and old.public_status is distinct from 'unavailable'
    and new.internal_status in (
      'sold_two_pm',
      'sold_exclusive',
      'withdrawn_after_7_days'
    )
  then
    new.visible_until := lead_unavailable_visible_until(now());
  end if;

  return new;
end;
$$;

drop trigger if exists leads_unavailable_visible_until on leads;
create trigger leads_unavailable_visible_until
before update on leads
for each row
execute function set_lead_unavailable_visible_until();

create or replace function expire_leads(p_now timestamptz default now())
returns table (
  expired_count integer,
  hidden_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired_count integer := 0;
  v_hidden_count integer := 0;
begin
  with expired as (
    update leads
    set
      internal_status = 'withdrawn_after_7_days',
      public_status = 'unavailable',
      updated_at = p_now
    where published_at is not null
      and expires_at is not null
      and expires_at <= p_now
      and internal_status in ('available', 'one_slot_sold')
    returning id
  )
  select count(*)::integer
  into v_expired_count
  from expired;

  select count(*)::integer
  into v_hidden_count
  from leads
  where published_at is not null
    and public_status = 'unavailable'
    and visible_until is not null
    and visible_until <= p_now;

  expired_count := v_expired_count;
  hidden_count := v_hidden_count;

  return next;
end;
$$;
