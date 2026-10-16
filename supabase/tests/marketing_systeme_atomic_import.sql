do $$
begin
  if current_setting('leadhost.isolated_schema_test', true) is distinct from 'true' then
    raise exception 'This test requires an isolated test database';
  end if;
end;
$$;

begin;

create function pg_temp.assert_true(p_value boolean, p_message text) returns void
language plpgsql as $$ begin
  if p_value is distinct from true then raise exception 'Assertion failed: %', p_message; end if;
end; $$;

create function pg_temp.import_case(
  p_message text, p_contact jsonb default '{"external_id":"123","full_name":"Mario Rossi","email":"lead@example.test","phone":"+393001234567","city":"Roma"}',
  p_page text default 'https://example.test/landing', p_hash text default repeat('a',64), p_rejection text default null
) returns jsonb language sql as $$
  select public.import_marketing_systeme_opt_in(
    '10000000-0000-4000-8000-000000000001', '2026-10-15T08:00:00Z',
    p_message, 'CONTACT_OPT_IN', p_hash, null, p_page, p_contact, p_rejection
  );
$$;

insert into public.profiles (id) values ('00000000-0000-4000-8000-000000000003');
insert into public.user_roles (profile_id, role) values
  ('00000000-0000-4000-8000-000000000001', 'property_manager'),
  ('00000000-0000-4000-8000-000000000002', 'property_manager'),
  ('00000000-0000-4000-8000-000000000003', 'property_manager');
insert into public.addon_products (id, slug) values ('50000000-0000-4000-8000-000000000001', 'marketing');
insert into public.addon_subscriptions (addon_product_id, profile_id, source, status) values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'manual', 'active'),
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'manual', 'active');

insert into public.marketing_crm_pipelines (id, profile_id, is_default) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', true),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', true);
insert into public.marketing_crm_stages (id, pipeline_id, name, position) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Nuovo lead', 0),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Nuovo lead', 0),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Richiamare', 1);
insert into public.marketing_crm_contacts (profile_id, pipeline_id, stage_id, full_name, email, notes) values
  ('00000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'Altro PM', 'lead@example.test', 'Private B');

insert into public.marketing_systeme_integrations (id, profile_id, enabled) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', true);
insert into public.marketing_systeme_webhook_secrets (integration_id, encrypted_secret, rotated_at) values
  ('10000000-0000-4000-8000-000000000001', repeat('fixture-',8), '2026-10-15T08:00:00Z'),
  ('10000000-0000-4000-8000-000000000003', repeat('fixture-',8), '2026-10-15T08:00:00Z');

select pg_temp.assert_true(pg_temp.import_case('first', p_page => null)->>'status' = 'imported', 'all mode accepts missing source URL');
select pg_temp.assert_true(pg_temp.import_case('first', p_page => null)->>'status' = 'duplicate', 'delivery retry is idempotent');
select pg_temp.assert_true(pg_temp.import_case('first', p_hash => repeat('b',64))->>'status' = 'conflict', 'same message cannot carry different data');
select pg_temp.assert_true((select count(*) = 1 from public.marketing_crm_contacts where profile_id = '00000000-0000-4000-8000-000000000001'), 'one private CRM contact after retry');

update public.marketing_crm_contacts
set full_name = 'Nome corretto dal PM', notes = 'Appuntamento concordato', phone = '+390000000000', city = null,
  stage_id = '30000000-0000-4000-8000-000000000003', next_follow_up_at = '2026-11-01T12:00:00Z'
where profile_id = '00000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(pg_temp.import_case('second')->>'status' = 'updated', 'second opt-in links the existing contact');
select pg_temp.assert_true((select full_name = 'Nome corretto dal PM' and notes = 'Appuntamento concordato'
  and phone = '+390000000000' and city = 'Roma' and stage_id = '30000000-0000-4000-8000-000000000003'
  and next_follow_up_at = '2026-11-01T12:00:00Z' from public.marketing_crm_contacts
  where profile_id = '00000000-0000-4000-8000-000000000001'), 'manual work preserved; only empty city filled');
select pg_temp.assert_true((select notes = 'Private B' from public.marketing_crm_contacts
  where profile_id = '00000000-0000-4000-8000-000000000002'), 'same email in another PM CRM is untouched');

insert into public.marketing_crm_contacts (profile_id, pipeline_id, stage_id, full_name, email)
values ('00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'Contatto manuale', 'manual@example.test');
select pg_temp.assert_true(pg_temp.import_case('manual-link', '{"external_id":"456","full_name":"Altra versione","email":"manual@example.test","phone":"123"}')->>'status' = 'updated', 'one matching private email is linked');
select pg_temp.assert_true((select count(*) = 1 from public.marketing_crm_contacts where email = 'manual@example.test'), 'no duplicate of manual contact');

update public.marketing_systeme_integrations set import_mode = 'selected_pages', allowed_page_urls = array['https://example.test/landing'];
select pg_temp.assert_true(pg_temp.import_case('wrong-page', p_page => 'https://example.test/other')->>'reason' = 'page_filtered', 'unselected page is ignored');
select pg_temp.assert_true(pg_temp.import_case('missing-page', p_page => null)->>'reason' = 'source_page_missing', 'missing source cannot bypass filtering');
select pg_temp.assert_true(pg_temp.import_case('selected-page')->>'status' = 'updated', 'selected page accepted');

update public.marketing_systeme_integrations set enabled = false;
select pg_temp.assert_true(pg_temp.import_case('disabled')->>'reason' = 'connection_disabled', 'disabled connection cannot import');
update public.marketing_systeme_integrations set enabled = true;
update public.profiles set status = 'suspended' where id = '00000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(pg_temp.import_case('suspended')->>'reason' = 'profile_inactive', 'suspended owner cannot import');
update public.profiles set status = 'active';

update public.addon_subscriptions set access_expires_at = now() - interval '1 minute';
select pg_temp.assert_true(pg_temp.import_case('expired-manual')->>'reason' = 'marketing_access_required', 'expired manual addon cannot import');
update public.addon_subscriptions set source = 'stripe', status = 'trialing', trial_ends_at = now() + interval '1 day';
select pg_temp.assert_true(pg_temp.import_case('valid-trial')->>'status' = 'updated', 'valid trial can import');
update public.addon_subscriptions set trial_ends_at = now() - interval '1 minute';
select pg_temp.assert_true(pg_temp.import_case('expired-trial')->>'reason' = 'marketing_access_required', 'expired trial cannot import');
update public.addon_subscriptions set status = 'past_due', current_period_ends_at = now() + interval '1 day';
select pg_temp.assert_true(pg_temp.import_case('valid-grace')->>'status' = 'updated', 'existing grace access is respected');
update public.addon_subscriptions set current_period_ends_at = now() - interval '1 minute';
select pg_temp.assert_true(pg_temp.import_case('expired-grace')->>'reason' = 'marketing_access_required', 'expired grace cannot import');
update public.addon_subscriptions set status = 'active';

select pg_temp.assert_true(pg_temp.import_case('invalid-contact', p_contact => null, p_rejection => 'missing_name')->>'status' = 'failed', 'missing name is visible as permanent failure');
select pg_temp.assert_true(public.import_marketing_systeme_opt_in(
  '10000000-0000-4000-8000-000000000001', '2026-10-15T07:00:00Z', 'stale-secret', 'CONTACT_OPT_IN', repeat('c',64)
)->>'status' = 'stale_secret', 'rotating secret invalidates an in-flight old verification');
select pg_temp.assert_true(not exists(select 1 from public.marketing_systeme_webhook_events where message_id = 'stale-secret'), 'stale verification has no side effects');

create function pg_temp.reject_test_link() returns trigger language plpgsql as $$ begin
  if new.external_contact_id = 'force_failure' then raise exception 'Simulated write failure'; end if;
  return new;
end; $$;
create trigger force_failure before insert on public.marketing_systeme_contact_links for each row execute function pg_temp.reject_test_link();
select pg_temp.assert_true(pg_temp.import_case('retryable', '{"external_id":"force_failure","full_name":"Test rollback","email":"rollback@example.test"}')->>'reason' = 'import_failed', 'failed link produces retryable error');
select pg_temp.assert_true(not exists(select 1 from public.marketing_crm_contacts where email = 'rollback@example.test'), 'contact insert rolls back with failed link');
drop trigger force_failure on public.marketing_systeme_contact_links;
select pg_temp.assert_true(pg_temp.import_case('retryable', '{"external_id":"force_failure","full_name":"Test rollback","email":"rollback@example.test"}')->>'status' = 'imported', 'same failed message can recover');

select pg_temp.assert_true(public.import_marketing_systeme_opt_in(
  '10000000-0000-4000-8000-000000000003', '2026-10-15T08:00:00Z', 'no-pipeline', 'CONTACT_OPT_IN', repeat('a',64),
  null, 'https://example.test/landing', '{"external_id":"789","full_name":"Test CRM","email":"ready@example.test"}'
)->>'reason' = 'crm_not_ready', 'missing CRM fails safely');
insert into public.marketing_crm_pipelines (id, profile_id, is_default) values
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', true);
insert into public.marketing_crm_stages (pipeline_id, name) values ('20000000-0000-4000-8000-000000000003', 'Nuovo lead');
select pg_temp.assert_true(public.import_marketing_systeme_opt_in(
  '10000000-0000-4000-8000-000000000003', '2026-10-15T08:00:00Z', 'no-pipeline', 'CONTACT_OPT_IN', repeat('a',64),
  null, 'https://example.test/landing', '{"external_id":"789","full_name":"Test CRM","email":"ready@example.test"}'
)->>'status' = 'imported', 'retry succeeds after CRM setup');

select pg_temp.assert_true(not has_function_privilege('authenticated',
  'public.import_marketing_systeme_opt_in(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text)', 'execute'), 'clients cannot execute import');
select pg_temp.assert_true(has_function_privilege('service_role',
  'public.import_marketing_systeme_opt_in(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text)', 'execute'), 'server may execute import');

rollback;
