-- New public-exclusive command only; the existing purchase and refund RPCs stay intact.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Preserve all currently allowed compensation types, including future unrelated additions.
do $migration$
declare v_check text;
begin
  select pg_get_expr(conbin,conrelid) into v_check from pg_constraint
    where conrelid = 'public.team_compensation_events'::regclass
      and conname = 'team_compensation_events_type' and contype = 'c';
  if v_check is null then raise exception 'booking_compensation_constraint_missing'; end if;
  if position(quote_literal('marketplace_booking_call') in v_check) = 0 then
    alter table public.team_compensation_events drop constraint team_compensation_events_type;
    execute format('alter table public.team_compensation_events add constraint team_compensation_events_type check ((%s) or event_type = %L) not valid',v_check,'marketplace_booking_call');
    alter table public.team_compensation_events validate constraint team_compensation_events_type;
  end if;
end;
$migration$;

do $migration$
begin
  if not exists(select 1 from pg_constraint where conrelid = 'public.team_compensation_events'::regclass
    and conname = 'team_compensation_booking_call_amounts') then
    alter table public.team_compensation_events add constraint team_compensation_booking_call_amounts check (
      (event_type <> 'marketplace_booking_call' or (amount_cents = 300 and fixed_rate_cents is not distinct from 300))
      and (event_type <> 'refund_adjustment' or source_event_key !~ '^marketplace_booking_call_refund:'
        or (amount_cents = -300 and fixed_rate_cents is not distinct from 300))
    ) not valid;
    alter table public.team_compensation_events validate constraint team_compensation_booking_call_amounts;
  end if;
end;
$migration$;

create or replace function public.get_marketplace_booking_call_readiness_v2()
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select public.get_marketplace_booking_call_readiness_v1()
    || jsonb_build_object('schemaVersion',2,'engineReady',true);
$function$;

create or replace function public.purchase_exclusive_lead_with_booking_call(
  p_profile_id uuid, p_property_manager_id uuid, p_lead_id uuid,
  p_expected_lead_amount_cents integer, p_expected_booking_fee_cents integer,
  p_terms_version text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_wallet public.wallets;
  v_lead public.leads;
  v_purchase public.lead_purchases;
  v_booking public.marketplace_booking_calls;
  v_claim public.team_lead_verification_claims;
  v_config jsonb;
  v_lead_amount integer;
  v_fee integer;
  v_total integer;
  v_balance integer;
  v_member_id uuid;
  v_assignee uuid;
  v_event_id uuid;
  v_promotion_id uuid;
  v_promotion_name text;
begin
  if p_request_id is null or p_profile_id is null or p_property_manager_id is null or p_lead_id is null
    or p_expected_lead_amount_cents is null or p_expected_lead_amount_cents <= 0
    or p_expected_booking_fee_cents is null or p_expected_booking_fee_cents <= 0 then
    raise exception 'invalid_booking_purchase';
  end if;
  if nullif(trim(p_terms_version),'') is null then raise exception 'terms_acceptance_required'; end if;
  if not exists(select 1 from public.property_manager_profiles pm
    join public.profiles p on p.id = pm.profile_id join public.user_roles ur on ur.profile_id = p.id
    where pm.id = p_property_manager_id and pm.profile_id = p_profile_id
      and pm.verification_status <> 'suspended' and p.status = 'active' and ur.role = 'property_manager') then
    raise exception 'property_manager_not_authorized';
  end if;

  -- Same wallet -> lead lock order as the ordinary purchase command.
  insert into public.wallets(profile_id) values(p_profile_id) on conflict(profile_id) do nothing;
  select * into strict v_wallet from public.wallets where profile_id = p_profile_id for update;
  if lower(v_wallet.currency) <> 'eur' then raise exception 'booking_wallet_currency_invalid'; end if;

  -- A retry returns the original purchase, even if price or availability changed afterwards.
  select * into v_booking from public.marketplace_booking_calls where id = p_request_id;
  if found then
    if v_booking.property_manager_id <> p_property_manager_id or v_booking.lead_id <> p_lead_id
      or v_booking.lead_amount_cents <> p_expected_lead_amount_cents
      or v_booking.booking_fee_cents <> p_expected_booking_fee_cents then
      raise exception 'booking_request_conflict';
    end if;
    select * into strict v_purchase from public.lead_purchases where id = v_booking.lead_purchase_id;
    if v_booking.status = 'refunded' or v_purchase.status = 'refunded' then raise exception 'booking_purchase_refunded'; end if;
    return jsonb_build_object('bookingCallId',v_booking.id,'purchaseId',v_purchase.id,'leadId',v_booking.lead_id,
      'leadAmountCents',v_booking.lead_amount_cents,'bookingFeeCents',v_booking.booking_fee_cents,
      'amountCents',v_booking.total_amount_cents,'balanceCents',v_wallet.balance_cents,
      'compensationCents',v_booking.compensation_cents,'qualifyingMemberId',v_booking.qualifying_member_id,'replayed',true);
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then raise exception 'lead_not_found'; end if;
  if v_lead.visibility_mode <> 'public' then raise exception 'booking_public_only'; end if;
  if v_lead.published_at is null then raise exception 'lead_not_found'; end if;
  if coalesce(v_lead.expires_at,v_lead.visible_until,v_lead.created_at) <= now() then raise exception 'lead_unavailable'; end if;
  if exists(select 1 from public.lead_purchases p where p.lead_id = p_lead_id
    and p.property_manager_id = p_property_manager_id and p.status in ('paid','contact_unlocked')) then
    raise exception 'already_purchased';
  end if;
  if v_lead.internal_status <> 'available' or v_lead.shared_slots_sold <> 0 or v_lead.exclusive_purchase_id is not null then
    raise exception 'exclusive_not_available';
  end if;

  -- A concurrent settings save cannot change a component after it has been checked.
  perform 1 from public.settings where key in ('lead.booking_call_enabled','lead.booking_call_fee_cents') order by key for share;
  v_config := public.get_marketplace_booking_call_readiness_v1();
  if not coalesce((v_config ->> 'enabled')::boolean,false) then raise exception 'booking_call_disabled'; end if;
  v_fee := (v_config ->> 'feeCents')::integer;
  select effective_price_cents,promotion_id,promotion_name into v_lead_amount,v_promotion_id,v_promotion_name
    from public.resolve_marketplace_promotional_price(v_lead.exclusive_price_cents,'exclusive'::public.purchase_mode,now());
  if v_lead_amount is null or v_lead_amount <= 0 or v_fee <= 0
    or v_lead_amount::bigint + v_fee::bigint > 2147483647 then raise exception 'booking_total_out_of_range'; end if;
  v_total := v_lead_amount + v_fee;
  if v_lead_amount <> p_expected_lead_amount_cents or v_fee <> p_expected_booking_fee_cents then
    raise exception 'price_changed' using detail = jsonb_build_object('currentAmountCents',v_total,
      'leadAmountCents',v_lead_amount,'bookingFeeCents',v_fee)::text;
  end if;
  if v_wallet.balance_cents < v_total then
    raise exception 'insufficient_credit' using detail = jsonb_build_object('balance_cents',v_wallet.balance_cents,
      'required_amount_cents',v_total,'missing_amount_cents',v_total-v_wallet.balance_cents)::text;
  end if;

  select c.* into v_claim from public.team_lead_verification_claims c
    join public.team_compensation_events e on e.id = c.compensation_event_id
    where c.owner_request_id = v_lead.owner_request_id and c.status = 'confirmed'
      and e.event_type = 'lead_verification' and e.status = 'accrued' and e.member_id = c.member_id
      and e.owner_request_id = c.owner_request_id;
  if found then
    v_member_id := v_claim.member_id;
    select id into v_assignee from public.team_members where id = v_member_id and status = 'active';
    perform pg_advisory_xact_lock(hashtextextended(v_member_id::text,0));
  end if;

  -- The existing membership guard still runs on this insert.
  insert into public.lead_purchases(lead_id,property_manager_id,purchase_attempt_id,mode,amount_cents,status,unlocked_at)
    values(p_lead_id,p_property_manager_id,null,'exclusive',v_total,'contact_unlocked',now()) returning * into v_purchase;
  update public.leads set shared_slots_sold = 0, exclusive_purchase_id = v_purchase.id,
    internal_status = 'sold_exclusive', public_status = 'unavailable' where id = p_lead_id;
  v_balance := v_wallet.balance_cents - v_total;
  update public.wallets set balance_cents = v_balance where id = v_wallet.id;
  insert into public.wallet_transactions(wallet_id,profile_id,type,status,amount_cents,balance_after_cents,
    description,provider,provider_reference,lead_purchase_id,metadata,completed_at)
  values(v_wallet.id,p_profile_id,'lead_purchase','completed',-v_total,v_balance,
    'Acquisto lead con booking Call: ' || v_lead.title,'wallet',v_purchase.id::text,v_purchase.id,
    jsonb_build_object('lead_id',p_lead_id,'purchase_mode','exclusive','base_amount_cents',v_lead.exclusive_price_cents,
      'promotion_id',v_promotion_id,'promotion_name',v_promotion_name,'visibility_mode','public','prime_purchase',false,
      'booking_call_id',p_request_id,'lead_amount_cents',v_lead_amount,'booking_fee_cents',v_fee,'total_amount_cents',v_total),now());
  insert into public.terms_acceptances(profile_id,context,terms_version,lead_purchase_id,metadata)
    values(p_profile_id,'lead_purchase',p_terms_version,v_purchase.id,jsonb_build_object('lead_id',p_lead_id,
      'purchase_mode','exclusive','amount_cents',v_total,'lead_amount_cents',v_lead_amount,'booking_fee_cents',v_fee,
      'booking_call_id',p_request_id,'base_amount_cents',v_lead.exclusive_price_cents,
      'promotion_id',v_promotion_id,'visibility_mode','public','prime_purchase',false));

  insert into public.team_compensation_events(member_id,event_type,status,source_type,source_id,source_event_key,
    owner_request_id,lead_id,property_manager_profile_id,amount_cents,base_amount_cents,fixed_rate_cents,currency,
    description,metadata,occurred_at)
  values(v_member_id,'marketplace_booking_call',case when v_member_id is null then 'pending_attribution' else 'accrued' end,
    'lead_purchase',v_purchase.id::text,'marketplace_booking_call:' || v_purchase.id::text,v_lead.owner_request_id,
    p_lead_id,p_profile_id,300,v_fee,300,'EUR','Booking Call - acquisto esclusivo Marketplace',
    jsonb_build_object('booking_call_id',p_request_id,'lead_purchase_id',v_purchase.id,
      'qualification_claim_id',v_claim.id,'lead_amount_cents',v_lead_amount,'booking_fee_cents',v_fee,
      'total_amount_cents',v_total,'attribution_reason',case when v_member_id is null then 'confirmed_qualifier_missing' else 'confirmed_qualifier' end),v_purchase.created_at)
    returning id into v_event_id;
  insert into public.marketplace_booking_calls(id,lead_purchase_id,lead_id,owner_request_id,property_manager_id,
    qualification_claim_id,qualifying_member_id,assigned_member_id,lead_amount_cents,booking_fee_cents,total_amount_cents,
    compensation_event_id,created_at)
  values(p_request_id,v_purchase.id,p_lead_id,v_lead.owner_request_id,p_property_manager_id,v_claim.id,
    v_member_id,v_assignee,v_lead_amount,v_fee,v_total,v_event_id,v_purchase.created_at) returning * into v_booking;
  insert into public.marketplace_booking_call_email_outbox(booking_call_id) values(v_booking.id);
  return jsonb_build_object('bookingCallId',v_booking.id,'purchaseId',v_purchase.id,'leadId',p_lead_id,
    'leadAmountCents',v_lead_amount,'bookingFeeCents',v_fee,'amountCents',v_total,'balanceCents',v_balance,
    'compensationCents',300,'qualifyingMemberId',v_member_id,'replayed',false);
end;
$function$;

-- Narrow trigger: ordinary refunds perform just an indexed lookup and return unchanged.
create or replace function public.capture_booking_call_wallet_refund()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_booking public.marketplace_booking_calls;
  v_refund public.refunds;
  v_purchase public.lead_purchases;
  v_event public.team_compensation_events;
  v_reversal_id uuid;
  v_profile_id uuid;
begin
  select * into v_booking from public.marketplace_booking_calls where lead_purchase_id = new.lead_purchase_id;
  if not found then return new; end if;
  -- Attribution and refund share this lock before any member lock or booking row lock.
  perform pg_advisory_xact_lock(hashtextextended('booking_call:' || v_booking.id::text,0));
  select * into strict v_booking from public.marketplace_booking_calls where id = v_booking.id for update;
  select * into v_refund from public.refunds where id::text = new.metadata ->> 'refund_id';
  select * into v_purchase from public.lead_purchases where id = new.lead_purchase_id;
  select profile_id into v_profile_id from public.property_manager_profiles where id = v_booking.property_manager_id;
  if v_refund.id is null or v_refund.lead_purchase_id is distinct from v_booking.lead_purchase_id
    or v_refund.requested_by_property_manager_id is distinct from v_booking.property_manager_id
    or v_refund.status is distinct from 'paid' or v_purchase.status is distinct from 'refunded'
    or v_refund.amount_cents is distinct from v_booking.total_amount_cents
    or v_purchase.amount_cents is distinct from v_booking.total_amount_cents
    or new.amount_cents is distinct from v_booking.total_amount_cents or new.profile_id is distinct from v_profile_id
    or not exists(select 1 from public.wallets w where w.id = new.wallet_id and w.profile_id = v_profile_id) then
    raise exception 'booking_refund_evidence_invalid';
  end if;
  if v_booking.refund_id = v_refund.id then return new; end if;
  if v_booking.refund_id is not null then raise exception 'booking_refund_already_recorded'; end if;
  select * into v_event from public.team_compensation_events where id = v_booking.compensation_event_id;
  if v_event.id is null or v_event.event_type <> 'marketplace_booking_call' or v_event.amount_cents <> 300
    or v_event.source_event_key <> 'marketplace_booking_call:' || v_booking.lead_purchase_id::text
    or v_event.member_id is distinct from v_booking.qualifying_member_id
    or v_event.owner_request_id is distinct from v_booking.owner_request_id
    or v_event.lead_id is distinct from v_booking.lead_id then
    raise exception 'booking_compensation_evidence_invalid';
  end if;
  if v_event.member_id is not null then perform pg_advisory_xact_lock(hashtextextended(v_event.member_id::text,0)); end if;
  select * into strict v_event from public.team_compensation_events where id = v_booking.compensation_event_id for update;
  if v_event.status <> 'voided' then
    insert into public.team_compensation_events(member_id,event_type,status,source_type,source_id,source_event_key,
      owner_request_id,lead_id,property_manager_profile_id,amount_cents,base_amount_cents,fixed_rate_cents,currency,
      description,metadata,occurred_at)
    values(v_event.member_id,'refund_adjustment',v_event.status,'refund',v_refund.id::text,
      'marketplace_booking_call_refund:' || v_booking.lead_purchase_id::text,v_booking.owner_request_id,v_booking.lead_id,
      v_profile_id,-300,v_booking.booking_fee_cents,300,'EUR','Lead rimborsato - storno booking Call',
      jsonb_build_object('booking_call_id',v_booking.id,'lead_purchase_id',v_booking.lead_purchase_id,
        'refund_id',v_refund.id,'reverses_compensation_event_id',v_event.id),coalesce(v_refund.reviewed_at,now()))
      returning id into v_reversal_id;
  end if;
  update public.marketplace_booking_calls set status = 'refunded',refund_id = v_refund.id,
    refunded_at = coalesce(v_refund.reviewed_at,now()),reversal_event_id = v_reversal_id,updated_at = now()
    where id = v_booking.id;
  update public.marketplace_booking_call_email_outbox set status = 'skipped',completed_at = now(),
    lease_id = null,locked_at = null,last_error = 'Acquisto riaccreditato: booking annullato.'
    where booking_call_id = v_booking.id and status in ('pending','processing');
  return new;
end;
$function$;

-- A missing historical qualifier must be resolved as a pair if already refunded.
-- The generic attribution command must never assign +300 and -300 to different people.
create or replace function public.guard_booking_call_ledger_attribution()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_booking public.marketplace_booking_calls;
begin
  if old.event_type <> 'marketplace_booking_call'
    and not (old.event_type = 'refund_adjustment' and old.source_event_key ~ '^marketplace_booking_call_refund:') then return new; end if;
  if row(new.event_type,new.amount_cents,new.fixed_rate_cents,new.currency,new.source_type,new.source_id,
      new.source_event_key,new.owner_request_id,new.lead_id,new.property_manager_profile_id,new.occurred_at)
    is distinct from row(old.event_type,old.amount_cents,old.fixed_rate_cents,old.currency,old.source_type,old.source_id,
      old.source_event_key,old.owner_request_id,old.lead_id,old.property_manager_profile_id,old.occurred_at)
    or new.metadata ->> 'booking_call_id' is distinct from old.metadata ->> 'booking_call_id' then
    raise exception 'booking_ledger_immutable';
  end if;
  if new.member_id is not distinct from old.member_id and new.status is not distinct from old.status then return new; end if;
  select * into v_booking from public.marketplace_booking_calls where id::text = old.metadata ->> 'booking_call_id';
  if old.status = 'pending_attribution' and old.member_id is null and new.status = 'accrued'
    and new.member_id is not null and v_booking.qualifying_member_id = new.member_id then
    if old.event_type = 'refund_adjustment' and not exists(select 1 from public.team_compensation_events e
      where e.id = v_booking.compensation_event_id and e.member_id = new.member_id and e.status = 'accrued') then
      raise exception 'booking_attribution_requires_booking_command';
    end if;
    return new;
  end if;
  raise exception 'booking_attribution_requires_booking_command';
end;
$function$;
drop trigger if exists booking_call_ledger_attribution_guard on public.team_compensation_events;
create trigger booking_call_ledger_attribution_guard before update on public.team_compensation_events
  for each row execute function public.guard_booking_call_ledger_attribution();

create or replace function public.attribute_booking_call_compensation(
  p_booking_call_id uuid,p_member_id uuid,p_actor_profile_id uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_booking public.marketplace_booking_calls;
  v_event public.team_compensation_events;
begin
  if not exists(select 1 from public.profiles p join public.user_roles r on r.profile_id = p.id
    where p.id = p_actor_profile_id and p.status = 'active' and r.role = 'super_admin') then
    raise exception 'reviewer_not_authorized';
  end if;
  if not exists(select 1 from public.team_members m join public.profiles p on p.id = m.profile_id
    where m.id = p_member_id and m.status = 'active' and p.status = 'active') then raise exception 'active_team_member_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('booking_call:' || p_booking_call_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_member_id::text,0));
  select * into v_booking from public.marketplace_booking_calls where id = p_booking_call_id for update;
  if not found then raise exception 'booking_call_not_found'; end if;
  select * into strict v_event from public.team_compensation_events where id = v_booking.compensation_event_id for update;
  if v_booking.qualifying_member_id = p_member_id and v_event.member_id = p_member_id and v_event.status = 'accrued' then
    return jsonb_build_object('bookingCallId',v_booking.id,'replayed',true);
  end if;
  if v_booking.qualifying_member_id is not null or v_event.member_id is not null or v_event.status <> 'pending_attribution' then
    raise exception 'booking_compensation_already_attributed';
  end if;
  update public.marketplace_booking_calls set qualifying_member_id = p_member_id,
    assigned_member_id = case when status = 'refunded' then assigned_member_id else coalesce(assigned_member_id,p_member_id) end,
    updated_at = now(),updated_by = p_actor_profile_id where id = v_booking.id;
  update public.team_compensation_events set member_id = p_member_id,status = 'accrued',
    metadata = metadata || jsonb_build_object('attributed_by',p_actor_profile_id,'attribution_reason','admin_resolved_missing_qualifier')
    where id = v_event.id;
  if v_booking.reversal_event_id is not null then
    update public.team_compensation_events set member_id = p_member_id,status = 'accrued'
      where id = v_booking.reversal_event_id and member_id is null and status = 'pending_attribution';
    if not found then raise exception 'booking_reversal_attribution_conflict'; end if;
  end if;
  insert into public.team_compensation_audit_logs(actor_profile_id,action,target_type,target_id,after_data)
    values(p_actor_profile_id,'booking_call.compensation_attributed','booking_call',v_booking.id::text,
      jsonb_build_object('member_id',p_member_id,'compensation_event_id',v_event.id,'reversal_event_id',v_booking.reversal_event_id));
  return jsonb_build_object('bookingCallId',v_booking.id,'replayed',false);
end;
$function$;
drop trigger if exists booking_call_refund_capture on public.wallet_transactions;
create trigger booking_call_refund_capture after insert on public.wallet_transactions
  for each row when (new.type = 'refund' and new.status = 'completed')
  execute function public.capture_booking_call_wallet_refund();

revoke all on function public.get_marketplace_booking_call_readiness_v2() from public,anon,authenticated;
revoke all on function public.purchase_exclusive_lead_with_booking_call(uuid,uuid,uuid,integer,integer,text,uuid) from public,anon,authenticated;
revoke all on function public.capture_booking_call_wallet_refund() from public,anon,authenticated;
revoke all on function public.guard_booking_call_ledger_attribution() from public,anon,authenticated;
revoke all on function public.attribute_booking_call_compensation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_marketplace_booking_call_readiness_v2() to service_role;
grant execute on function public.purchase_exclusive_lead_with_booking_call(uuid,uuid,uuid,integer,integer,text,uuid) to service_role;
grant execute on function public.attribute_booking_call_compensation(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
