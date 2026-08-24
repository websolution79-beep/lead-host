-- Keep compensation eligibility aligned with the Team role. Existing custom
-- rates are preserved; only the enabled activities are initialized by role.

create or replace function public.sync_team_member_compensation_rules_for_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_name text;
  v_role_key text;
  v_is_account_manager boolean;
begin
  select name into v_role_name
  from public.team_roles
  where id = new.role_id;

  v_role_key := regexp_replace(lower(trim(coalesce(v_role_name, ''))), '[^a-z]', '', 'g');
  v_is_account_manager := v_role_key in ('accountmanager', 'accounmanager');

  insert into public.team_member_compensation_rules (
    member_id,
    lead_verification_enabled,
    prime_first_activation_enabled,
    prime_renewal_enabled,
    prime_lead_purchase_enabled
  ) values (
    new.id,
    true,
    v_is_account_manager,
    v_is_account_manager,
    v_is_account_manager
  )
  on conflict (member_id) do update
  set
    lead_verification_enabled = true,
    prime_first_activation_enabled = v_is_account_manager,
    prime_renewal_enabled = v_is_account_manager,
    prime_lead_purchase_enabled = v_is_account_manager,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists team_members_sync_compensation_rules on public.team_members;
create trigger team_members_sync_compensation_rules
after insert or update of role_id on public.team_members
for each row
execute function public.sync_team_member_compensation_rules_for_role();

-- Backfill current members, including those whose role was changed after the
-- compensation feature was initially activated.
update public.team_member_compensation_rules rule
set
  lead_verification_enabled = true,
  prime_first_activation_enabled = true,
  prime_renewal_enabled = true,
  prime_lead_purchase_enabled = true,
  updated_at = now()
from public.team_members member
join public.team_roles role on role.id = member.role_id
where rule.member_id = member.id
  and member.status = 'active'
  and regexp_replace(lower(trim(role.name)), '[^a-z]', '', 'g')
    in ('accountmanager', 'accounmanager');

insert into public.team_member_compensation_rules (
  member_id,
  lead_verification_enabled,
  prime_first_activation_enabled,
  prime_renewal_enabled,
  prime_lead_purchase_enabled
)
select
  member.id,
  true,
  true,
  true,
  true
from public.team_members member
join public.team_roles role on role.id = member.role_id
where member.status = 'active'
  and regexp_replace(lower(trim(role.name)), '[^a-z]', '', 'g')
    in ('accountmanager', 'accounmanager')
on conflict (member_id) do nothing;

revoke all on function public.sync_team_member_compensation_rules_for_role() from public;
revoke all on function public.sync_team_member_compensation_rules_for_role() from anon, authenticated;

