-- Dormant until both compensation switches are enabled. No historical attribution.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.team_compensation_events drop constraint team_compensation_events_type;
alter table public.team_compensation_events add constraint team_compensation_events_type check (
  event_type in ('lead_verification','prime_first_activation','prime_renewal','prime_lead_purchase',
    'marketplace_promotion_sale','refund_adjustment','manual_adjustment')
) not valid;
alter table public.team_compensation_events validate constraint team_compensation_events_type;

create table if not exists public.marketplace_lead_promotion_sales (
  lead_id uuid primary key references public.leads(id) on delete restrict,
  purchase_id uuid not null unique references public.lead_purchases(id) on delete restrict,
  wallet_transaction_id uuid not null unique references public.wallet_transactions(id) on delete restrict,
  member_id uuid not null references public.team_members(id) on delete restrict,
  assigned_at timestamptz not null,
  publication_at timestamptz not null,
  assignment_revision bigint not null check (assignment_revision > 0),
  amount_cents integer not null check (amount_cents >= 0),
  occurred_at timestamptz not null default clock_timestamp(),
  compensation_event_id uuid unique references public.team_compensation_events(id) on delete restrict,
  reversal_event_id uuid unique references public.team_compensation_events(id) on delete restrict,
  processed_at timestamptz,
  refund_handled_at timestamptz,
  available_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0,
  last_error text
);
create index if not exists marketplace_promotion_sales_pending_idx
  on public.marketplace_lead_promotion_sales(available_at, occurred_at) where processed_at is null;
create index if not exists refunds_marketplace_promotion_paid_idx
  on public.refunds(lead_purchase_id) where status = 'paid';
alter table public.marketplace_lead_promotion_sales enable row level security;
revoke all on public.marketplace_lead_promotion_sales from public, anon, authenticated, service_role;
grant select on public.marketplace_lead_promotion_sales to service_role;

-- Only records evidence; no ledger calculation or remote call in the purchase transaction.
-- The lead lock serializes claims, reassignments and purchases, including shared slots.
create or replace function public.capture_marketplace_promotion_sale_at_purchase()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_purchase public.lead_purchases;
  v_lead public.leads;
  v_promotion public.marketplace_lead_promotions;
  v_inserted uuid;
begin
  if not exists(select 1 from public.team_compensation_settings where id = true
    and feature_enabled and marketplace_promotion_enabled) then return new; end if;
  if new.type <> 'lead_purchase' or new.status <> 'completed'
    or coalesce(new.metadata ->> 'visibility_mode','') <> 'public'
    or coalesce(new.metadata ->> 'prime_purchase','') <> 'false'
  then return new; end if;
  select * into v_purchase from public.lead_purchases where id = new.lead_purchase_id;
  if not found then return new; end if;
  select * into v_lead from public.leads where id = v_purchase.lead_id for update;
  if not found or v_lead.visibility_mode <> 'public' then return new; end if;
  select * into v_promotion from public.marketplace_lead_promotions where lead_id = v_lead.id for update;
  if not found or v_promotion.state <> 'assigned'
    or v_promotion.publication_at is distinct from v_lead.published_at then return new; end if;
  insert into public.marketplace_lead_promotion_sales(
    lead_id,purchase_id,wallet_transaction_id,member_id,assigned_at,publication_at,assignment_revision,amount_cents
  ) values(v_lead.id,v_purchase.id,new.id,v_promotion.member_id,v_promotion.assigned_at,
    v_promotion.publication_at,v_promotion.revision,v_promotion.amount_cents_snapshot)
  on conflict(lead_id) do nothing returning lead_id into v_inserted;
  if v_inserted is not null then
    update public.marketplace_lead_promotions set state = 'converted', purchase_id = v_purchase.id,
      revision = revision + 1 where lead_id = v_lead.id;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_marketplace_promotion_sale_at_purchase() from public, anon, authenticated;
drop trigger if exists marketplace_promotion_sale_capture on public.wallet_transactions;
create trigger marketplace_promotion_sale_capture after insert on public.wallet_transactions
  for each row when (new.type = 'lead_purchase' and new.status = 'completed')
  execute function public.capture_marketplace_promotion_sale_at_purchase();

-- Captured sales remain liabilities even after disabling new promotion claims.
create or replace function public.process_marketplace_promotion_sale(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_sale public.marketplace_lead_promotion_sales;
  v_purchase public.lead_purchases;
  v_original public.team_compensation_events;
  v_refund public.refunds;
  v_profile_id uuid;
  v_event_id uuid;
  v_reversal_id uuid;
begin
  select * into v_sale from public.marketplace_lead_promotion_sales where lead_id = p_lead_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  -- Same member lock as manual payouts: a refund cannot race a new liquidation.
  perform pg_advisory_xact_lock(hashtextextended(v_sale.member_id::text,0));
  select * into v_purchase from public.lead_purchases where id = v_sale.purchase_id;
  if not found or v_purchase.lead_id <> v_sale.lead_id or not exists(
    select 1 from public.wallet_transactions w where w.id = v_sale.wallet_transaction_id
      and w.lead_purchase_id = v_sale.purchase_id and w.type = 'lead_purchase' and w.status = 'completed'
      and w.metadata ->> 'visibility_mode' = 'public' and w.metadata ->> 'prime_purchase' = 'false'
  ) then raise exception 'marketplace_promotion_purchase_evidence_invalid'; end if;
  select profile_id into v_profile_id from public.property_manager_profiles where id = v_purchase.property_manager_id;

  if v_sale.processed_at is null then
    if v_sale.amount_cents > 0 then
      insert into public.team_compensation_events(
        member_id,event_type,status,source_type,source_id,source_event_key,lead_id,property_manager_profile_id,
        amount_cents,base_amount_cents,fixed_rate_cents,currency,description,metadata,occurred_at
      ) values(v_sale.member_id,'marketplace_promotion_sale','accrued','lead_purchase',v_sale.purchase_id::text,
        'marketplace_promotion_sale:' || v_sale.lead_id::text,v_sale.lead_id,v_profile_id,
        v_sale.amount_cents,v_purchase.amount_cents,v_sale.amount_cents,'EUR','Vendita lead Marketplace - promozione',
        jsonb_build_object('lead_purchase_id',v_sale.purchase_id,'wallet_transaction_id',v_sale.wallet_transaction_id,
          'assignment_revision',v_sale.assignment_revision,'assigned_at',v_sale.assigned_at,
          'publication_at',v_sale.publication_at,'visibility_mode','public'),v_sale.occurred_at)
      on conflict(source_event_key) do nothing returning id into v_event_id;
      select * into v_original from public.team_compensation_events
        where source_event_key = 'marketplace_promotion_sale:' || v_sale.lead_id::text;
      if not found or v_original.event_type <> 'marketplace_promotion_sale' or v_original.member_id <> v_sale.member_id
        or v_original.source_id <> v_sale.purchase_id::text or v_original.amount_cents <> v_sale.amount_cents
      then raise exception 'marketplace_promotion_compensation_conflict'; end if;
      v_event_id := v_original.id;
    end if;
    update public.marketplace_lead_promotion_sales set processed_at = clock_timestamp(),
      compensation_event_id = v_event_id, last_error = null where lead_id = p_lead_id;
    update public.marketplace_lead_promotions set compensation_event_id = v_event_id
      where lead_id = p_lead_id and state = 'converted' and purchase_id = v_sale.purchase_id;
    v_sale.compensation_event_id := v_event_id;
  end if;

  if v_sale.refund_handled_at is null then
    select * into v_refund from public.refunds where lead_purchase_id = v_sale.purchase_id
      and status = 'paid' and (amount_cents is null or amount_cents > 0) order by reviewed_at nulls last,created_at,id limit 1;
    if found then
      if v_sale.compensation_event_id is not null then
        select * into v_original from public.team_compensation_events where id = v_sale.compensation_event_id;
        if v_original.status = 'accrued' then
          insert into public.team_compensation_events(
            member_id,event_type,status,source_type,source_id,source_event_key,lead_id,property_manager_profile_id,
            amount_cents,base_amount_cents,fixed_rate_cents,currency,description,metadata,occurred_at
          ) values(v_original.member_id,'refund_adjustment','accrued','refund',v_refund.id::text,
            'marketplace_promotion_refund:' || v_sale.lead_id::text,v_sale.lead_id,v_original.property_manager_profile_id,
            -abs(v_original.amount_cents),coalesce(v_refund.amount_cents,v_purchase.amount_cents),v_original.fixed_rate_cents,'EUR',
            'Lead rimborsato - storno promozione Marketplace',jsonb_build_object('refund_id',v_refund.id,
              'lead_purchase_id',v_sale.purchase_id,'reverses_compensation_event_id',v_original.id),
            coalesce(v_refund.reviewed_at,clock_timestamp()))
          on conflict(source_event_key) do nothing returning id into v_reversal_id;
          if v_reversal_id is null then select id into v_reversal_id from public.team_compensation_events
            where source_event_key = 'marketplace_promotion_refund:' || v_sale.lead_id::text; end if;
        end if;
      end if;
      update public.marketplace_lead_promotion_sales set refund_handled_at = clock_timestamp(),
        reversal_event_id = v_reversal_id where lead_id = p_lead_id;
    end if;
  end if;
  return jsonb_build_object('status','completed','compensation_event_id',v_sale.compensation_event_id);
end;
$$;

create or replace function public.reconcile_marketplace_promotion_compensations(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_completed integer := 0; v_failed integer := 0;
begin
  for v_id in
    select s.lead_id from public.marketplace_lead_promotion_sales s
    where s.available_at <= clock_timestamp() and (s.processed_at is null or
      (s.refund_handled_at is null and exists(select 1 from public.refunds r
        where r.lead_purchase_id = s.purchase_id and r.status = 'paid' and (r.amount_cents is null or r.amount_cents > 0))))
    order by s.available_at,s.occurred_at,s.lead_id
    limit greatest(1,least(coalesce(p_limit,50),100)) for update skip locked
  loop
    begin
      perform public.process_marketplace_promotion_sale(v_id);
      update public.marketplace_lead_promotion_sales set last_error = null where lead_id = v_id;
      v_completed := v_completed + 1;
    exception when others then
      update public.marketplace_lead_promotion_sales set attempts = attempts + 1,
        last_error = left(sqlerrm,1000),
        available_at = clock_timestamp() + interval '1 minute' * least(360,power(2,least(attempts,8))::integer)
        where lead_id = v_id;
      v_failed := v_failed + 1;
    end;
  end loop;
  return jsonb_build_object('completed',v_completed,'failed',v_failed);
end;
$$;
revoke all on function public.process_marketplace_promotion_sale(uuid) from public, anon, authenticated;
revoke all on function public.reconcile_marketplace_promotion_compensations(integer) from public, anon, authenticated;
grant execute on function public.process_marketplace_promotion_sale(uuid) to service_role;
grant execute on function public.reconcile_marketplace_promotion_compensations(integer) to service_role;
commit;
