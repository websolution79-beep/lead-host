-- Step 1 only: dormant configuration and commercial assignment storage.
-- No purchase/refund/PRIME function replacements, triggers or compensation entries.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.team_compensation_settings
  add column if not exists marketplace_promotion_enabled boolean not null default false,
  add column if not exists marketplace_promotion_wait_minutes integer not null default 0,
  add column if not exists marketplace_promotion_sale_cents integer not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.team_compensation_settings'::regclass and conname = 'team_compensation_marketplace_promotion_rates') then
    alter table public.team_compensation_settings add constraint team_compensation_marketplace_promotion_rates
      check (marketplace_promotion_wait_minutes >= 0 and marketplace_promotion_sale_cents >= 0);
  end if;
end $$;

create table if not exists public.marketplace_lead_promotions (
  lead_id uuid primary key references public.leads(id) on delete restrict,
  member_id uuid not null references public.team_members(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null,
  publication_at timestamptz not null,
  amount_cents_snapshot integer not null check (amount_cents_snapshot >= 0),
  wait_minutes_snapshot integer not null check (wait_minutes_snapshot >= 0),
  revision bigint not null default 1 check (revision > 0),
  state text not null check (state in ('assigned','released','converted')),
  released_at timestamptz,
  released_by uuid references public.profiles(id) on delete restrict,
  purchase_id uuid unique references public.lead_purchases(id) on delete restrict,
  compensation_event_id uuid unique references public.team_compensation_events(id) on delete restrict,
  constraint marketplace_lead_promotion_release_state check (
    (state = 'released' and released_at is not null and released_by is not null)
    or (state <> 'released' and released_at is null and released_by is null)
  ),
  constraint marketplace_lead_promotion_conversion_state check (
    (state = 'converted' and purchase_id is not null)
    or (state <> 'converted' and purchase_id is null and compensation_event_id is null)
  )
);
create index if not exists marketplace_lead_promotions_member_idx
  on public.marketplace_lead_promotions(member_id, state);

create table if not exists public.marketplace_lead_promotion_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete restrict,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('claimed','reassigned','released')),
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists marketplace_lead_promotion_history_lead_idx
  on public.marketplace_lead_promotion_history(lead_id, created_at desc);

alter table public.marketplace_lead_promotions enable row level security;
alter table public.marketplace_lead_promotion_history enable row level security;
revoke all on public.marketplace_lead_promotions, public.marketplace_lead_promotion_history from public, anon, authenticated;
grant select, insert, update, delete on public.marketplace_lead_promotions, public.marketplace_lead_promotion_history to service_role;

create or replace function public.save_marketplace_promotion_settings(
  p_actor_profile_id uuid, p_enabled boolean, p_wait_minutes integer, p_sale_cents integer
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_before public.team_compensation_settings; v_after public.team_compensation_settings;
begin
  if not exists (select 1 from public.profiles p join public.user_roles ur on ur.profile_id = p.id
    where p.id = p_actor_profile_id and p.status = 'active' and ur.role = 'super_admin') then
    raise exception 'Superadmin richiesto' using errcode = '42501';
  end if;
  if p_enabled is null or p_wait_minutes is null or p_sale_cents is null or p_wait_minutes < 0 or p_sale_cents < 0 then
    raise exception 'Impostazioni promozione non valide' using errcode = '22023';
  end if;
  select * into v_before from public.team_compensation_settings where id = true for update;
  if not found then raise exception 'Impostazioni compensi non disponibili'; end if;
  update public.team_compensation_settings set marketplace_promotion_enabled = p_enabled,
    marketplace_promotion_wait_minutes = p_wait_minutes, marketplace_promotion_sale_cents = p_sale_cents,
    updated_by = p_actor_profile_id
  where id = true returning * into v_after;
  insert into public.team_compensation_audit_logs(actor_profile_id,action,target_type,target_id,before_data,after_data)
  values(p_actor_profile_id,'team_compensation.marketplace_promotion_settings_updated','team_compensation_settings','true',
    jsonb_build_object('enabled',v_before.marketplace_promotion_enabled,'waitMinutes',v_before.marketplace_promotion_wait_minutes,'saleCents',v_before.marketplace_promotion_sale_cents),
    jsonb_build_object('enabled',v_after.marketplace_promotion_enabled,'waitMinutes',v_after.marketplace_promotion_wait_minutes,'saleCents',v_after.marketplace_promotion_sale_cents));
  return jsonb_build_object('enabled',v_after.marketplace_promotion_enabled,'waitMinutes',v_after.marketplace_promotion_wait_minutes,'saleCents',v_after.marketplace_promotion_sale_cents);
end;
$$;

create or replace function public.set_marketplace_lead_promotion(
  p_lead_id uuid, p_actor_profile_id uuid, p_expected_revision bigint,
  p_action text default 'claim', p_member_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_lead public.leads; v_settings public.team_compensation_settings;
  v_before public.marketplace_lead_promotions; v_after public.marketplace_lead_promotions;
  v_admin boolean; v_member uuid; v_now timestamptz; v_available_at timestamptz; v_action text;
begin
  if not public.can_take_owner_request(p_actor_profile_id) then return jsonb_build_object('status','forbidden'); end if;
  select exists(select 1 from public.user_roles where profile_id = p_actor_profile_id and role = 'super_admin') into v_admin;
  if p_action is null or p_action not in ('claim','release') or p_expected_revision is null or p_expected_revision < 0 then
    return jsonb_build_object('status','invalid_command');
  end if;
  if p_action = 'release' and not v_admin then return jsonb_build_object('status','forbidden'); end if;

  -- Same row and locking order as the existing purchase's lead lock; no Wallet locks here.
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  v_now := clock_timestamp();
  select * into v_before from public.marketplace_lead_promotions where lead_id = p_lead_id;
  if coalesce(v_before.revision,0) <> p_expected_revision then return jsonb_build_object('status','conflict'); end if;
  if v_before.state = 'converted' or v_before.purchase_id is not null then return jsonb_build_object('status','already_converted'); end if;

  if p_action = 'release' then
    if v_before.lead_id is null then return jsonb_build_object('status','not_found'); end if;
    if v_before.state = 'released' then return jsonb_build_object('status','unchanged','revision',v_before.revision); end if;
    update public.marketplace_lead_promotions set state = 'released', released_at = v_now,
      released_by = p_actor_profile_id, revision = revision + 1 where lead_id = p_lead_id returning * into v_after;
    v_action := 'released';
  else
    select * into v_settings from public.team_compensation_settings where id = true;
    if not found or not v_settings.feature_enabled or not v_settings.marketplace_promotion_enabled then
      return jsonb_build_object('status','disabled');
    end if;
    if v_lead.visibility_mode <> 'public' or v_lead.published_at is null
      or v_lead.internal_status not in ('available','one_slot_sold')
      or v_lead.public_status not in ('available','last_availability')
      or v_lead.exclusive_purchase_id is not null or v_lead.shared_slots_sold >= 2
      or coalesce(v_lead.expires_at,v_lead.visible_until,v_lead.created_at) <= v_now then
      return jsonb_build_object('status','unavailable');
    end if;
    v_available_at := v_lead.published_at + make_interval(mins => v_settings.marketplace_promotion_wait_minutes);
    if v_now < v_available_at then return jsonb_build_object('status','waiting','availableAt',v_available_at); end if;
    if p_member_id is null then
      select id into v_member from public.team_members where profile_id = p_actor_profile_id and status = 'active';
    else v_member := p_member_id;
    end if;
    if not exists(select 1 from public.team_members tm where tm.id = v_member and tm.status = 'active'
      and public.can_take_owner_request(tm.profile_id)
      and (v_admin or tm.profile_id = p_actor_profile_id)) then
      return jsonb_build_object('status','invalid_member');
    end if;
    if v_before.state = 'assigned' and v_before.publication_at = v_lead.published_at then
      if v_before.member_id = v_member then return jsonb_build_object('status','unchanged','revision',v_before.revision); end if;
      if not v_admin then return jsonb_build_object('status','occupied'); end if;
    end if;
    v_action := case when v_before.state = 'assigned' and v_before.publication_at = v_lead.published_at then 'reassigned' else 'claimed' end;
    insert into public.marketplace_lead_promotions(lead_id,member_id,assigned_by,assigned_at,publication_at,
      amount_cents_snapshot,wait_minutes_snapshot,revision,state)
    values(p_lead_id,v_member,p_actor_profile_id,v_now,v_lead.published_at,
      v_settings.marketplace_promotion_sale_cents,v_settings.marketplace_promotion_wait_minutes,coalesce(v_before.revision,0)+1,'assigned')
    on conflict(lead_id) do update set member_id = excluded.member_id, assigned_by = excluded.assigned_by,
      assigned_at = excluded.assigned_at, publication_at = excluded.publication_at,
      amount_cents_snapshot = excluded.amount_cents_snapshot, wait_minutes_snapshot = excluded.wait_minutes_snapshot,
      revision = excluded.revision, state = 'assigned', released_at = null, released_by = null
    returning * into v_after;
  end if;
  insert into public.marketplace_lead_promotion_history(lead_id,actor_profile_id,action,before_data,after_data)
  values(p_lead_id,p_actor_profile_id,v_action,case when v_before.lead_id is null then null else to_jsonb(v_before) end,to_jsonb(v_after));
  return jsonb_build_object('status','saved','revision',v_after.revision);
end;
$$;

revoke all on function public.save_marketplace_promotion_settings(uuid,boolean,integer,integer) from public, anon, authenticated;
revoke all on function public.set_marketplace_lead_promotion(uuid,uuid,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.save_marketplace_promotion_settings(uuid,boolean,integer,integer) to service_role;
grant execute on function public.set_marketplace_lead_promotion(uuid,uuid,bigint,text,uuid) to service_role;
commit;
