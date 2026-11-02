-- Preparatory only: no purchase/refund functions or existing triggers change.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

insert into public.settings (key, value) values
  ('lead.booking_call_enabled', 'false'::jsonb),
  ('lead.booking_call_fee_cents', '0'::jsonb)
on conflict (key) do nothing;

create table if not exists public.marketplace_booking_calls (
  id uuid primary key default gen_random_uuid(),
  lead_purchase_id uuid not null unique references public.lead_purchases(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete restrict,
  owner_request_id uuid not null references public.owner_requests(id) on delete restrict,
  property_manager_id uuid not null references public.property_manager_profiles(id) on delete restrict,
  qualification_claim_id uuid references public.team_lead_verification_claims(id) on delete restrict,
  qualifying_member_id uuid references public.team_members(id) on delete restrict,
  assigned_member_id uuid references public.team_members(id) on delete restrict,
  lead_amount_cents integer not null,
  booking_fee_cents integer not null,
  total_amount_cents integer not null,
  compensation_cents integer not null default 300,
  compensation_event_id uuid unique references public.team_compensation_events(id) on delete restrict,
  reversal_event_id uuid unique references public.team_compensation_events(id) on delete restrict,
  currency text not null default 'EUR',
  visibility_mode text not null default 'public',
  status text not null default 'to_schedule',
  scheduled_at timestamptz,
  refund_id uuid unique references public.refunds(id) on delete restrict,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint marketplace_booking_calls_amounts check (
    lead_amount_cents > 0 and booking_fee_cents > 0
    and total_amount_cents::bigint = lead_amount_cents::bigint + booking_fee_cents::bigint
  ),
  constraint marketplace_booking_calls_compensation check (compensation_cents = 300),
  constraint marketplace_booking_calls_currency check (currency = 'EUR'),
  constraint marketplace_booking_calls_public_only check (visibility_mode = 'public'),
  constraint marketplace_booking_calls_status check (status in ('to_schedule','in_progress','scheduled','refunded')),
  constraint marketplace_booking_calls_schedule check (status <> 'scheduled' or scheduled_at is not null),
  constraint marketplace_booking_calls_refund check (
    (status = 'refunded' and refund_id is not null and refunded_at is not null)
    or (status <> 'refunded' and refund_id is null and refunded_at is null)
  ),
  constraint marketplace_booking_calls_reversal check (reversal_event_id is null or compensation_event_id is not null)
);
comment on column public.marketplace_booking_calls.qualifying_member_id is
  'Snapshot of the confirmed qualifier at purchase; booking compensation belongs to this member, not the first worker or promoter.';
comment on column public.marketplace_booking_calls.assigned_member_id is
  'Operational booking coordinator. Reassignment must not silently transfer the original compensation.';
comment on column public.marketplace_booking_calls.compensation_cents is
  'EUR 3.00 earned at purchase, not when scheduled; reversed only for a paid wallet refund of this purchase.';

create index if not exists marketplace_booking_calls_open_idx
  on public.marketplace_booking_calls(status,created_at) where status in ('to_schedule','in_progress');
create index if not exists marketplace_booking_calls_member_idx
  on public.marketplace_booking_calls(assigned_member_id,status,created_at);
create index if not exists marketplace_booking_calls_lead_idx
  on public.marketplace_booking_calls(lead_id);

create table if not exists public.marketplace_booking_call_email_outbox (
  booking_call_id uuid primary key references public.marketplace_booking_calls(id) on delete restrict,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_id uuid,
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint marketplace_booking_call_email_status check (status in ('pending','processing','sent','skipped')),
  constraint marketplace_booking_call_email_attempts check (attempts >= 0),
  constraint marketplace_booking_call_email_lease check (
    (status = 'processing' and lease_id is not null and locked_at is not null)
    or (status <> 'processing' and lease_id is null and locked_at is null)
  ),
  constraint marketplace_booking_call_email_completion check (
    (status in ('sent','skipped') and completed_at is not null)
    or (status in ('pending','processing') and completed_at is null)
  )
);
create index if not exists marketplace_booking_call_email_pending_idx
  on public.marketplace_booking_call_email_outbox(available_at,created_at) where status = 'pending';
create index if not exists marketplace_booking_call_email_leases_idx
  on public.marketplace_booking_call_email_outbox(locked_at) where status = 'processing';

alter table public.marketplace_booking_calls enable row level security;
alter table public.marketplace_booking_call_email_outbox enable row level security;
revoke all on public.marketplace_booking_calls, public.marketplace_booking_call_email_outbox
  from public, anon, authenticated, service_role;
grant select on public.marketplace_booking_calls, public.marketplace_booking_call_email_outbox to service_role;

-- Readiness is opt-in and service-only; missing/malformed configuration fails closed.
create or replace function public.get_marketplace_booking_call_readiness_v1()
returns jsonb language sql stable security definer set search_path = ''
as $function$
  with config as (
    select
      coalesce((select value = 'true'::jsonb from public.settings where key = 'lead.booking_call_enabled'),false) as enabled,
      (select value from public.settings where key = 'lead.booking_call_fee_cents') as fee
  ), parsed as (
    select enabled, case
      when jsonb_typeof(fee) = 'number' then case
        when (fee::text)::numeric between 0 and 2147483647
          and trunc((fee::text)::numeric) = (fee::text)::numeric then (fee::text)::numeric::integer
        else 0 end
      else 0 end as fee_cents from config
  )
  select jsonb_build_object('schemaVersion',1,'enabled',enabled and fee_cents > 0,
    'feeCents',fee_cents,'compensationCents',300,'currency','EUR') from parsed;
$function$;
revoke all on function public.get_marketplace_booking_call_readiness_v1() from public, anon, authenticated;
grant execute on function public.get_marketplace_booking_call_readiness_v1() to service_role;
notify pgrst, 'reload schema';
commit;
