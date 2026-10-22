begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Annotate only new automatic-signup events. Never rewrite historical choices.
-- This is operational evidence of automatic activation, not an explicit marketing checkbox.
create or replace function annotate_pm_signup_marketing_activation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_metadata jsonb;
begin
  if new.source <> 'pm_registration' then
    return new;
  end if;

  select u.raw_user_meta_data into v_metadata
  from auth.users u
  join public.profiles p on p.auth_user_id = u.id
  where p.id = new.profile_id
    and u.id::text = new.evidence->>'auth_user_id';

  if v_metadata->>'marketing_activation_source' = 'pm_signup_automatic'
     and v_metadata->>'marketing_activation_automatic' = 'true' then
    new.source := 'pm_registration_automatic';
    new.evidence := coalesce(new.evidence, '{}'::jsonb) || jsonb_build_object(
      'explicit_checkbox', false,
      'automatic_activation', true,
      'activation_source', 'pm_signup_automatic',
      'registration_notice_version', v_metadata->>'registration_notice_version',
      'registration_notice_text', v_metadata->>'registration_notice_text'
    );
  end if;
  return new;
end;
$$;

revoke all on function annotate_pm_signup_marketing_activation() from public, anon, authenticated;

drop trigger if exists pm_signup_marketing_activation_evidence on public.pm_marketing_consent_events;
create trigger pm_signup_marketing_activation_evidence
before insert on public.pm_marketing_consent_events
for each row execute function annotate_pm_signup_marketing_activation();

-- The application must not enable automatic activation before the evidence trigger is installed.
create or replace function pm_signup_automatic_marketing_ready()
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from pg_trigger
    where tgrelid = 'public.pm_marketing_consent_events'::regclass
      and tgname = 'pm_signup_marketing_activation_evidence'
      and tgenabled in ('O', 'A')
      and tgfoid = 'public.annotate_pm_signup_marketing_activation()'::regprocedure
  );
$$;

revoke all on function pm_signup_automatic_marketing_ready() from public, anon, authenticated;
grant execute on function pm_signup_automatic_marketing_ready() to service_role;
notify pgrst, 'reload schema';

commit;
