-- Additive protection; inactive while marketplace.membership.paidAccessEnabled is false.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function public.marketplace_membership_required()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((select value -> 'paidAccessEnabled' = 'true'::jsonb
    from public.settings where key = 'marketplace.membership'), false);
$$;

create or replace function public.profile_has_marketplace_membership(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select not public.marketplace_membership_required()
    or exists (
      select 1 from public.prime_accounts a where a.profile_id = p_profile_id
        and ((a.status = 'active' and (a.prime_expires_at is null or a.prime_expires_at > now()))
          or (a.status = 'past_due' and a.grace_ends_at > now()))
    )
    or exists (
      select 1 from public.addon_subscriptions s
      join public.addon_products p on p.id = s.addon_product_id
      where s.profile_id = p_profile_id and p.slug = 'marketplace'
        and ((s.status = 'active' and s.current_period_ends_at > now())
          or (s.status = 'trialing' and s.trial_ends_at > now()))
    );
$$;

create or replace function public.guard_marketplace_purchase_membership()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
begin
  if not public.marketplace_membership_required() then return new; end if;
  if new.status not in ('paid', 'contact_unlocked') then return new; end if;
  -- Status maintenance of a previously completed purchase is not a new sale.
  if tg_op = 'UPDATE' then
    if old.status in ('paid', 'contact_unlocked')
      and old.lead_id = new.lead_id and old.property_manager_id = new.property_manager_id
    then return new; end if;
  end if;
  -- PRIME private purchases retain the existing assignment/access checks in the RPC.
  if not exists (select 1 from public.leads l where l.id = new.lead_id and l.visibility_mode = 'public')
    then return new; end if;
  select profile_id into v_profile_id from public.property_manager_profiles
    where id = new.property_manager_id;
  if v_profile_id is null or not public.profile_has_marketplace_membership(v_profile_id) then
    raise exception 'marketplace_membership_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.marketplace_membership_required() from public, anon, authenticated;
revoke all on function public.profile_has_marketplace_membership(uuid) from public, anon, authenticated;
revoke all on function public.guard_marketplace_purchase_membership() from public, anon, authenticated;
grant execute on function public.marketplace_membership_required() to service_role;
grant execute on function public.profile_has_marketplace_membership(uuid) to service_role;

drop trigger if exists marketplace_purchase_membership_guard on public.lead_purchases;
create trigger marketplace_purchase_membership_guard
before insert or update of status, lead_id, property_manager_id on public.lead_purchases
for each row execute function public.guard_marketplace_purchase_membership();

commit;
