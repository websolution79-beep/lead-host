-- Run after the empty-database fixture and the CRM/Systeme.io foundation migrations.
-- No real customer data is used. Test changes are rolled back.
do $$
begin
  if current_setting('leadhost.isolated_schema_test', true) is distinct from 'true' then
    raise exception 'This test must run in an isolated test database';
  end if;
end;
$$;

begin;

create function pg_temp.assert_true(p_value boolean, p_message text) returns void
language plpgsql as $$
begin
  if p_value is distinct from true then
    raise exception 'Assertion failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.expect_error(p_query text, p_code text) returns void
language plpgsql as $$
declare
  v_caught boolean := false;
begin
  begin
    execute p_query;
  exception when others then
    if sqlstate <> p_code then
      raise exception 'Expected SQLSTATE %, received %: %', p_code, sqlstate, sqlerrm;
    end if;
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Expected SQLSTATE %, but query succeeded', p_code;
  end if;
end;
$$;

select pg_temp.assert_true(
  (select count(*) = 0 from public.marketing_systeme_integrations),
  'migration must not create or enable connections'
);

insert into public.marketing_crm_pipelines (id, profile_id, is_default) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', true),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', true);

insert into public.marketing_crm_stages (id, pipeline_id, name) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Nuovo lead'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Nuovo lead'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Stage removibile');

insert into public.marketing_crm_contacts (id, profile_id, pipeline_id, stage_id, full_name, notes) values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Contatto test A', 'Note originali A'),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'Contatto test B', 'Note originali B');

insert into public.marketing_systeme_integrations (id, profile_id, destination_stage_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002');

select pg_temp.assert_true(
  (select bool_and(not enabled and import_mode = 'all' and cardinality(allowed_page_urls) = 0)
   from public.marketing_systeme_integrations),
  'connections must start disabled, importing all pages by default'
);

select pg_temp.expect_error($q$
  insert into public.marketing_systeme_integrations (profile_id)
  values ('00000000-0000-4000-8000-000000000001')
$q$, '23505');

select pg_temp.expect_error($q$
  update public.marketing_systeme_integrations
  set destination_stage_id = '30000000-0000-4000-8000-000000000002'
  where id = '10000000-0000-4000-8000-000000000001'
$q$, '23514');

select pg_temp.expect_error($q$
  update public.marketing_systeme_integrations set import_mode = 'selected_pages'
  where id = '10000000-0000-4000-8000-000000000001'
$q$, '23514');

select pg_temp.expect_error($q$
  update public.marketing_systeme_integrations
  set allowed_page_urls = array['https://example.test/landing?utm_source=test']
  where id = '10000000-0000-4000-8000-000000000001'
$q$, '23514');

update public.marketing_systeme_integrations
set import_mode = 'selected_pages', allowed_page_urls = array['https://example.test/landing']
where id = '10000000-0000-4000-8000-000000000001';

insert into public.marketing_systeme_webhook_secrets (integration_id, encrypted_secret)
values ('10000000-0000-4000-8000-000000000001', repeat('test-ciphertext-', 4));

grant usage on schema public to anon, authenticated, service_role;
grant all on public.profiles, public.marketing_crm_pipelines,
  public.marketing_crm_stages, public.marketing_crm_contacts to service_role;
grant select, insert on public.marketing_crm_pipelines,
  public.marketing_crm_stages, public.marketing_crm_contacts to authenticated;

set local role service_role;

insert into public.marketing_systeme_contact_links
  (integration_id, profile_id, external_contact_id, crm_contact_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '123', '40000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '123', '40000000-0000-4000-8000-000000000002');

select pg_temp.expect_error($q$
  insert into public.marketing_systeme_contact_links
    (integration_id, profile_id, external_contact_id, crm_contact_id)
  values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '456', '40000000-0000-4000-8000-000000000002')
$q$, '23514');

select pg_temp.expect_error($q$
  insert into public.marketing_systeme_contact_links
    (integration_id, profile_id, external_contact_id, crm_contact_id)
  values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '123', '40000000-0000-4000-8000-000000000001')
$q$, '23505');

select pg_temp.expect_error($q$
  insert into public.marketing_systeme_webhook_events
    (integration_id, profile_id, message_id, event_type, payload_sha256)
  values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'wrong-owner', 'CONTACT_OPT_IN', repeat('a', 64))
$q$, '23503');

select pg_temp.expect_error($q$
  insert into public.marketing_systeme_webhook_events
    (integration_id, profile_id, message_id, event_type, payload_sha256, crm_contact_id)
  values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'wrong-contact', 'CONTACT_OPT_IN', repeat('a', 64), '40000000-0000-4000-8000-000000000002')
$q$, '23514');

insert into public.marketing_systeme_webhook_events
  (integration_id, profile_id, message_id, event_type, payload_sha256) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'message-123', 'CONTACT_OPT_IN', repeat('a', 64)),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'message-123', 'CONTACT_OPT_IN', repeat('b', 64));

select pg_temp.expect_error($q$
  insert into public.marketing_systeme_webhook_events
    (integration_id, profile_id, message_id, event_type, payload_sha256)
  values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'message-123', 'CONTACT_OPT_IN', repeat('a', 64))
$q$, '23505');

select pg_temp.expect_error($q$
  update public.marketing_systeme_webhook_events set status = 'imported'
  where integration_id = '10000000-0000-4000-8000-000000000001'
$q$, '23514');

update public.marketing_systeme_webhook_events
set status = 'imported', processed_at = now(), crm_contact_id = '40000000-0000-4000-8000-000000000001'
where integration_id = '10000000-0000-4000-8000-000000000001';

select pg_temp.assert_true(
  (select count(*) = 1 from public.marketing_systeme_webhook_secrets),
  'server must be able to retrieve encrypted signing secrets'
);

reset role;
set local leadhost.test_profile_id = '00000000-0000-4000-8000-000000000001';
set local leadhost.test_super_admin = 'false';
set local role authenticated;

select pg_temp.assert_true((select count(*) = 1 from public.marketing_systeme_integrations), 'PM may read only their connection');
select pg_temp.assert_true((select count(*) = 1 from public.marketing_systeme_webhook_events), 'PM may read only their events');
select pg_temp.assert_true((select count(*) = 1 from public.marketing_systeme_contact_links), 'PM may read only their contact links');

select pg_temp.expect_error('select * from public.marketing_systeme_webhook_secrets', '42501');
select pg_temp.expect_error('update public.marketing_systeme_integrations set enabled = true', '42501');
select pg_temp.expect_error('delete from public.marketing_systeme_webhook_events', '42501');

insert into public.marketing_crm_contacts (profile_id, pipeline_id, stage_id, full_name)
values ('00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Contatto manuale successivo');

select pg_temp.assert_true(
  (select notes = 'Note originali A' from public.marketing_crm_contacts where id = '40000000-0000-4000-8000-000000000001'),
  'integration metadata must not change existing CRM notes'
);

set local leadhost.test_super_admin = 'true';
select pg_temp.assert_true((select count(*) = 2 from public.marketing_systeme_integrations), 'superadmin may read connection metadata for support');
select pg_temp.expect_error('select * from public.marketing_systeme_webhook_secrets', '42501');

reset role;
set local role anon;
select pg_temp.expect_error('select * from public.marketing_systeme_integrations', '42501');
select pg_temp.expect_error('select * from public.marketing_systeme_webhook_secrets', '42501');
reset role;

update public.marketing_systeme_integrations
set destination_stage_id = '30000000-0000-4000-8000-000000000003'
where id = '10000000-0000-4000-8000-000000000001';
delete from public.marketing_crm_stages where id = '30000000-0000-4000-8000-000000000003';
select pg_temp.assert_true(
  (select destination_stage_id is null from public.marketing_systeme_integrations where id = '10000000-0000-4000-8000-000000000001'),
  'deleting an unused CRM stage must leave a connection with no destination override'
);

rollback;
