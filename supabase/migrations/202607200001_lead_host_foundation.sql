create extension if not exists pgcrypto;

create type app_role as enum ('property_manager', 'super_admin');
create type user_status as enum ('active', 'suspended');
create type pm_verification_status as enum ('not_verified', 'verified', 'suspended');
create type acquisition_channel as enum ('landing', 'meta_lead_ads', 'manual', 'api');
create type owner_request_status as enum (
  'new_from_meta',
  'waiting_for_completion',
  'completed',
  'to_verify',
  'approved',
  'published',
  'not_publishable'
);
create type lead_internal_status as enum (
  'available',
  'one_slot_sold',
  'sold_two_pm',
  'sold_exclusive',
  'withdrawn_after_7_days',
  'cancelled',
  'refunded'
);
create type lead_public_status as enum ('available', 'last_availability', 'unavailable');
create type purchase_mode as enum ('shared', 'exclusive');
create type purchase_status as enum ('initiated', 'reserved', 'checkout_created', 'payment_pending', 'paid', 'contact_unlocked', 'failed', 'expired', 'cancelled', 'refunded');
create type payment_status as enum ('created', 'pending', 'completed', 'failed', 'cancelled', 'refunded');
create type report_status as enum ('pending', 'reviewing', 'resolved', 'rejected');
create type refund_status as enum ('pending', 'approved', 'rejected', 'paid');

create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null unique,
  first_name text,
  last_name text,
  phone text,
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (profile_id, role)
);

create table property_manager_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  company_name text not null,
  vat_number text,
  website text,
  managed_properties_count integer,
  years_experience integer,
  business_description text,
  operating_model text,
  verification_status pm_verification_status not null default 'not_verified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table property_manager_services (
  id uuid primary key default gen_random_uuid(),
  property_manager_id uuid not null references property_manager_profiles(id) on delete cascade,
  service_code text not null,
  service_label text not null,
  delivery_model text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (property_manager_id, service_code, delivery_model)
);

create table property_manager_areas (
  id uuid primary key default gen_random_uuid(),
  property_manager_service_id uuid not null references property_manager_services(id) on delete cascade,
  scope text not null,
  region text,
  province text,
  city text,
  postal_code text,
  created_at timestamptz not null default now()
);

create table owner_requests (
  id uuid primary key default gen_random_uuid(),
  acquisition_channel acquisition_channel not null,
  status owner_request_status not null default 'completed',
  completion_token_hash text,
  completion_token_expires_at timestamptz,
  completion_token_invalidated_at timestamptz,
  privacy_consent_at timestamptz,
  data_sharing_consent_at timestamptz,
  marketing_consent_at timestamptz,
  normalized_payload jsonb not null default '{}'::jsonb,
  duplicate_check jsonb not null default '{}'::jsonb,
  qualification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table owner_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_request_id uuid not null unique references owner_requests(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  precise_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table properties (
  id uuid primary key default gen_random_uuid(),
  owner_request_id uuid not null unique references owner_requests(id) on delete cascade,
  region text,
  province text,
  city text,
  postal_code text,
  district text,
  property_type text,
  bedrooms integer,
  bathrooms integer,
  beds integer,
  approximate_area_sqm integer,
  current_status text[],
  requested_services text[] not null default '{}',
  timing text,
  description text,
  photo_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  owner_request_id uuid not null unique references owner_requests(id) on delete restrict,
  property_id uuid not null unique references properties(id) on delete restrict,
  title text not null,
  internal_status lead_internal_status not null default 'available',
  public_status lead_public_status not null default 'available',
  shared_slots_sold integer not null default 0 check (shared_slots_sold between 0 and 2),
  shared_price_cents integer not null default 2900,
  exclusive_price_cents integer not null default 5000,
  published_at timestamptz,
  expires_at timestamptz,
  visible_until timestamptz,
  exclusive_purchase_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_prices_fixed check (shared_price_cents = 2900 and exclusive_price_cents = 5000)
);

create table lead_sources (
  id uuid primary key default gen_random_uuid(),
  owner_request_id uuid references owner_requests(id) on delete set null,
  channel acquisition_channel not null,
  external_id text,
  idempotency_key text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  unique (channel, idempotency_key)
);

create table marketing_attribution (
  id uuid primary key default gen_random_uuid(),
  owner_request_id uuid not null unique references owner_requests(id) on delete cascade,
  source text,
  medium text,
  campaign text,
  content text,
  term text,
  landing_page text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  meta_campaign_id text,
  meta_campaign_name text,
  meta_adset_id text,
  meta_adset_name text,
  meta_ad_id text,
  meta_ad_name text,
  meta_form_id text,
  meta_form_name text,
  meta_lead_id text,
  acquired_at timestamptz not null default now()
);

create table meta_integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  meta_account_id text,
  facebook_page_id text,
  facebook_page_name text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table meta_forms (
  id uuid primary key default gen_random_uuid(),
  meta_integration_id uuid not null references meta_integrations(id) on delete cascade,
  form_id text not null,
  form_name text,
  completion_required boolean not null default true,
  auto_publish_mode text not null default 'manual_approval',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meta_integration_id, form_id)
);

create table meta_field_mappings (
  id uuid primary key default gen_random_uuid(),
  meta_form_id uuid not null references meta_forms(id) on delete cascade,
  source_field text not null,
  normalized_field text not null,
  transform_rule jsonb not null default '{}'::jsonb,
  is_required_for_publication boolean not null default false,
  created_at timestamptz not null default now(),
  unique (meta_form_id, source_field)
);

create table purchase_attempts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete restrict,
  property_manager_id uuid not null references property_manager_profiles(id) on delete restrict,
  mode purchase_mode not null,
  amount_cents integer not null,
  status purchase_status not null default 'initiated',
  stripe_checkout_session_id text unique,
  idempotency_key text not null unique,
  reserved_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_attempt_amount check (
    (mode = 'shared' and amount_cents = 2900)
    or (mode = 'exclusive' and amount_cents = 5000)
  )
);

create table lead_purchases (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete restrict,
  property_manager_id uuid not null references property_manager_profiles(id) on delete restrict,
  purchase_attempt_id uuid unique references purchase_attempts(id) on delete restrict,
  mode purchase_mode not null,
  amount_cents integer not null,
  status purchase_status not null default 'contact_unlocked',
  unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lead_id, property_manager_id),
  constraint lead_purchase_amount check (
    (mode = 'shared' and amount_cents = 2900)
    or (mode = 'exclusive' and amount_cents = 5000)
  )
);

alter table leads
  add constraint leads_exclusive_purchase_fk
  foreign key (exclusive_purchase_id) references lead_purchases(id);

create unique index one_exclusive_purchase_per_lead
  on lead_purchases (lead_id)
  where mode = 'exclusive' and status in ('paid', 'contact_unlocked');

create table payments (
  id uuid primary key default gen_random_uuid(),
  purchase_attempt_id uuid references purchase_attempts(id) on delete set null,
  provider text not null default 'stripe',
  provider_payment_id text unique,
  provider_checkout_session_id text unique,
  amount_cents integer not null,
  currency text not null default 'eur',
  status payment_status not null default 'created',
  raw_event jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  lead_purchase_id uuid not null references lead_purchases(id) on delete restrict,
  requested_by_property_manager_id uuid not null references property_manager_profiles(id) on delete restrict,
  amount_cents integer,
  status refund_status not null default 'pending',
  reason text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  lead_purchase_id uuid not null references lead_purchases(id) on delete restrict,
  property_manager_id uuid not null references property_manager_profiles(id) on delete restrict,
  reason text not null,
  details text,
  status report_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  property_manager_id uuid references property_manager_profiles(id) on delete cascade,
  channel text not null default 'internal',
  event_type text not null,
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profiles(id) on delete set null,
  actor_role text,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

insert into settings (key, value) values
  ('lead.availability_days', '7'::jsonb),
  ('lead.unavailable_visibility_days', '7'::jsonb),
  ('lead.shared_price_cents', '2900'::jsonb),
  ('lead.exclusive_price_cents', '5000'::jsonb),
  ('lead.max_shared_buyers', '2'::jsonb)
on conflict (key) do nothing;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on profiles for each row execute function set_updated_at();
create trigger property_manager_profiles_updated_at before update on property_manager_profiles for each row execute function set_updated_at();
create trigger owner_requests_updated_at before update on owner_requests for each row execute function set_updated_at();
create trigger owner_contacts_updated_at before update on owner_contacts for each row execute function set_updated_at();
create trigger properties_updated_at before update on properties for each row execute function set_updated_at();
create trigger leads_updated_at before update on leads for each row execute function set_updated_at();
create trigger meta_integrations_updated_at before update on meta_integrations for each row execute function set_updated_at();
create trigger meta_forms_updated_at before update on meta_forms for each row execute function set_updated_at();
create trigger purchase_attempts_updated_at before update on purchase_attempts for each row execute function set_updated_at();

create or replace function publish_lead(p_lead_id uuid)
returns leads
language plpgsql
security definer
as $$
declare
  v_lead leads;
begin
  update leads
  set
    internal_status = 'available',
    public_status = 'available',
    published_at = now(),
    expires_at = now() + interval '7 days',
    visible_until = now() + interval '14 days'
  where id = p_lead_id
  returning * into v_lead;

  if not found then
    raise exception 'lead_not_found';
  end if;

  return v_lead;
end;
$$;

create or replace function claim_paid_lead_purchase(
  p_purchase_attempt_id uuid,
  p_provider_payment_id text,
  p_provider_checkout_session_id text
)
returns lead_purchases
language plpgsql
security definer
as $$
declare
  v_attempt purchase_attempts;
  v_lead leads;
  v_purchase lead_purchases;
begin
  select * into v_attempt
  from purchase_attempts
  where id = p_purchase_attempt_id
  for update;

  if not found then
    raise exception 'purchase_attempt_not_found';
  end if;

  select * into v_lead
  from leads
  where id = v_attempt.lead_id
  for update;

  if not found then
    raise exception 'lead_not_found';
  end if;

  if v_lead.expires_at is null or v_lead.expires_at <= now() then
    update purchase_attempts set status = 'failed' where id = v_attempt.id;
    raise exception 'lead_unavailable';
  end if;

  if exists (
    select 1 from lead_purchases
    where purchase_attempt_id = v_attempt.id
  ) then
    select * into v_purchase
    from lead_purchases
    where purchase_attempt_id = v_attempt.id;
    return v_purchase;
  end if;

  if v_attempt.mode = 'exclusive' then
    if v_lead.shared_slots_sold <> 0 or v_lead.exclusive_purchase_id is not null then
      update purchase_attempts set status = 'failed' where id = v_attempt.id;
      raise exception 'exclusive_not_available';
    end if;
  else
    if v_lead.exclusive_purchase_id is not null or v_lead.shared_slots_sold >= 2 then
      update purchase_attempts set status = 'failed' where id = v_attempt.id;
      raise exception 'shared_slot_not_available';
    end if;
  end if;

  insert into lead_purchases (
    lead_id,
    property_manager_id,
    purchase_attempt_id,
    mode,
    amount_cents,
    status,
    unlocked_at
  ) values (
    v_attempt.lead_id,
    v_attempt.property_manager_id,
    v_attempt.id,
    v_attempt.mode,
    v_attempt.amount_cents,
    'contact_unlocked',
    now()
  )
  returning * into v_purchase;

  if v_attempt.mode = 'exclusive' then
    update leads
    set
      exclusive_purchase_id = v_purchase.id,
      internal_status = 'sold_exclusive',
      public_status = 'unavailable'
    where id = v_lead.id;
  else
    update leads
    set
      shared_slots_sold = shared_slots_sold + 1,
      internal_status = case
        when shared_slots_sold + 1 = 1 then 'one_slot_sold'::lead_internal_status
        else 'sold_two_pm'::lead_internal_status
      end,
      public_status = case
        when shared_slots_sold + 1 = 1 then 'last_availability'::lead_public_status
        else 'unavailable'::lead_public_status
      end
    where id = v_lead.id;
  end if;

  update purchase_attempts
  set
    status = 'contact_unlocked',
    stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_provider_checkout_session_id)
  where id = v_attempt.id;

  insert into payments (
    purchase_attempt_id,
    provider_payment_id,
    provider_checkout_session_id,
    amount_cents,
    status,
    confirmed_at
  ) values (
    v_attempt.id,
    p_provider_payment_id,
    p_provider_checkout_session_id,
    v_attempt.amount_cents,
    'completed',
    now()
  )
  on conflict (provider_checkout_session_id) do nothing;

  return v_purchase;
end;
$$;

alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table property_manager_profiles enable row level security;
alter table property_manager_services enable row level security;
alter table property_manager_areas enable row level security;
alter table owner_requests enable row level security;
alter table owner_contacts enable row level security;
alter table properties enable row level security;
alter table leads enable row level security;
alter table lead_sources enable row level security;
alter table marketing_attribution enable row level security;
alter table meta_integrations enable row level security;
alter table meta_forms enable row level security;
alter table meta_field_mappings enable row level security;
alter table purchase_attempts enable row level security;
alter table lead_purchases enable row level security;
alter table payments enable row level security;
alter table refunds enable row level security;
alter table reports enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;
alter table settings enable row level security;
