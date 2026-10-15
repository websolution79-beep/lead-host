do $$ begin
  if current_setting('leadhost.isolated_schema_test', true) is distinct from 'true' then
    raise exception 'This test requires an isolated test database';
  end if;
end; $$;
begin;

create function pg_temp.assert_true(p_value boolean, p_message text) returns void
language plpgsql as $$ begin
  if p_value is distinct from true then raise exception 'Assertion failed: %', p_message; end if;
end; $$;
create function pg_temp.expect_error(p_query text, p_code text) returns void
language plpgsql as $$ declare v_caught boolean := false; begin
  begin execute p_query; exception when others then
    if sqlstate <> p_code then raise exception 'Expected %, received %: %', p_code, sqlstate, sqlerrm; end if;
    v_caught := true;
  end;
  if not v_caught then raise exception 'Expected %, but query succeeded', p_code; end if;
end; $$;

select pg_temp.assert_true((select bool_and(routing_mode = 'legacy' and discovery_expires_at is null)
  from public.marketing_systeme_integrations), 'legacy mode remains selected; no discovery enabled');
select pg_temp.assert_true((select count(*) = 2 from public.marketing_systeme_flows), 'rerun produces exactly one initial flow per legacy connection');
select pg_temp.assert_true((select bool_and(f.enabled = c.enabled and f.import_mode = c.import_mode
  and f.allowed_page_urls = c.allowed_page_urls and f.destination_stage_id = c.destination_stage_id)
  from public.marketing_systeme_flows f join public.marketing_systeme_integrations c on c.id = f.integration_id),
  'legacy configuration and paused status copied faithfully');
select pg_temp.assert_true((select importer_source = (select prosrc from pg_proc where oid =
  'public.import_marketing_systeme_opt_in(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text)'::regprocedure)
  and contacts = (select jsonb_agg(to_jsonb(c) order by c.id) from public.marketing_crm_contacts c)
  and secrets = (select jsonb_agg(to_jsonb(s) order by s.integration_id) from public.marketing_systeme_webhook_secrets s)
  and connections = (select jsonb_agg(to_jsonb(c) - 'routing_mode' - 'discovery_expires_at' order by c.id)
    from public.marketing_systeme_integrations c)
  from public.leadhost_test_flow_baseline), 'existing importer, contacts, notes and secrets untouched');

grant usage on schema public to anon, authenticated, service_role;
grant all on public.profiles, public.marketing_crm_pipelines, public.marketing_crm_stages,
  public.marketing_crm_contacts to service_role;
set local role service_role;
insert into public.marketing_systeme_flows (id, integration_id, profile_id, name, import_mode, allowed_page_urls, destination_stage_id)
values ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', 'Roma', 'selected_pages', array['https://example.test/roma'],
  '30000000-0000-4000-8000-000000000003');
insert into public.marketing_systeme_flows (id, integration_id, profile_id, name, import_mode)
values ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', 'Altre richieste', 'all');
select pg_temp.assert_true((select not enabled from public.marketing_systeme_flows
  where id = '60000000-0000-4000-8000-000000000001'), 'new flows start paused');
select pg_temp.expect_error($q$ insert into public.marketing_systeme_flows
  (integration_id, profile_id, name, import_mode) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Secondo generale', 'all') $q$, '23505');
select pg_temp.expect_error($q$ insert into public.marketing_systeme_flows
  (integration_id, profile_id, name, import_mode, allowed_page_urls) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Ambiguo', 'selected_pages', array['https://example.test/roma']) $q$, '23514');
select pg_temp.expect_error($q$ update public.marketing_systeme_flows
  set allowed_page_urls = array['https://example.test/roma?utm_source=meta']
  where id = '60000000-0000-4000-8000-000000000001' $q$, '23514');
select pg_temp.expect_error($q$ update public.marketing_systeme_flows
  set allowed_page_urls = array['https://EXAMPLE.test/roma']
  where id = '60000000-0000-4000-8000-000000000001' $q$, '23514');
select pg_temp.expect_error($q$ update public.marketing_systeme_flows
  set allowed_page_urls = array['https://example.test/roma/']
  where id = '60000000-0000-4000-8000-000000000001' $q$, '23514');
select pg_temp.expect_error($q$ update public.marketing_systeme_flows
  set allowed_page_urls = array['https://user:password@example.test/roma']
  where id = '60000000-0000-4000-8000-000000000001' $q$, '23514');
select pg_temp.expect_error($q$ update public.marketing_systeme_flows
  set allowed_page_urls = array['https://example.test/roma','https://example.test/roma']
  where id = '60000000-0000-4000-8000-000000000001' $q$, '23514');
select pg_temp.expect_error($q$ update public.marketing_systeme_flows
  set destination_stage_id = '30000000-0000-4000-8000-000000000002'
  where id = '60000000-0000-4000-8000-000000000001' $q$, '23514');
select pg_temp.expect_error($q$ update public.marketing_systeme_flows
  set integration_id = '10000000-0000-4000-8000-000000000002', profile_id = '00000000-0000-4000-8000-000000000002'
  where id = '60000000-0000-4000-8000-000000000001' $q$, '23514');

insert into public.marketing_systeme_field_bindings (flow_id, integration_id, profile_id, source_slug, target_field, additional_label) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'comune_immobile', 'city', null),
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'obiettivo', 'additional', 'Obiettivo'),
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'tempistiche', 'additional', 'Quando iniziare');
select pg_temp.expect_error($q$ insert into public.marketing_systeme_field_bindings
  (flow_id, integration_id, profile_id, source_slug, target_field) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'altro_comune', 'city') $q$, '23505');
select pg_temp.expect_error($q$ insert into public.marketing_systeme_field_bindings
  (flow_id, integration_id, profile_id, source_slug, target_field) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'ruolo', 'role') $q$, '23514');
select pg_temp.expect_error($q$ insert into public.marketing_systeme_field_bindings
  (flow_id, integration_id, profile_id, source_slug, target_field) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'citta', 'city') $q$, '23514');
select pg_temp.expect_error($q$ insert into public.marketing_systeme_field_bindings
  (flow_id, integration_id, profile_id, source_slug, target_field) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'altro', 'additional') $q$, '23514');
select pg_temp.expect_error($q$ insert into public.marketing_systeme_field_bindings
  (flow_id, integration_id, profile_id, source_slug, target_field, additional_label) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'nuovo_obiettivo', 'additional', ' obiettivo ') $q$, '23505');

insert into public.marketing_systeme_discovered_fields (integration_id, profile_id, source_page_url, source_slug, field_label)
values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
  'https://example.test/roma', 'comune_immobile', 'Comune immobile');
select pg_temp.assert_true(not exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'marketing_systeme_discovered_fields'
  and column_name in ('value', 'sample_value', 'payload', 'email', 'secret')), 'field discovery cannot store submitted values');
insert into public.marketing_systeme_contact_fields (integration_id, profile_id, crm_contact_id, flow_id, flow_name, field_key, label, value)
values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'Roma', 'roma:obiettivo', 'Obiettivo', 'Gestione completa');
select pg_temp.expect_error($q$ update public.marketing_systeme_contact_fields
  set crm_contact_id = '40000000-0000-4000-8000-000000000002' $q$, '23514');
insert into public.marketing_systeme_webhook_events
  (id, integration_id, profile_id, message_id, event_type, payload_sha256)
values ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', 'mapping-test', 'CONTACT_OPT_IN', repeat('a',64));
insert into public.marketing_systeme_event_context (event_id, integration_id, profile_id, flow_id, flow_name, warnings)
values ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'Roma', '[{"field":"camere","code":"invalid_number"}]');
select pg_temp.expect_error($q$ update public.marketing_systeme_event_context
  set warnings = '[{"field":"camere","code":"invalid_number","value":"private answer"}]' $q$, '23514');
select pg_temp.expect_error($q$ update public.marketing_systeme_event_context
  set integration_id = '10000000-0000-4000-8000-000000000002', profile_id = '00000000-0000-4000-8000-000000000002', flow_id = null $q$, '23514');
select pg_temp.expect_error($q$ insert into public.marketing_systeme_event_context
  (event_id,integration_id,profile_id) values ('70000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002') $q$, '23514');
select pg_temp.assert_true(not public.marketing_systeme_warnings_valid('{}')
  and not public.marketing_systeme_warnings_valid('[null]')
  and not public.marketing_systeme_warnings_valid('[{"field":"camere"}]')
  and not public.marketing_systeme_warnings_valid('[{"field":"camere","code":"unknown"}]'),
  'warning metadata rejects malformed entries and unknown codes');
reset role;

set local role authenticated;
select set_config('leadhost.test_profile_id', '00000000-0000-4000-8000-000000000001', true);
select pg_temp.assert_true((select count(*) = 3 from public.marketing_systeme_flows), 'PM sees own three flows only');
select pg_temp.assert_true((select count(*) = 3 from public.marketing_systeme_field_bindings), 'PM sees own mappings');
select pg_temp.expect_error($q$ update public.marketing_systeme_flows set enabled = true $q$, '42501');
select pg_temp.expect_error($q$ insert into public.marketing_systeme_discovered_fields
  (integration_id,profile_id,source_slug) values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','secret') $q$, '42501');
select set_config('leadhost.test_profile_id', '00000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true((select count(*) = 1 from public.marketing_systeme_flows), 'other PM sees only own initial flow');
select pg_temp.assert_true((select count(*) = 0 from public.marketing_systeme_field_bindings)
  and (select count(*) = 0 from public.marketing_systeme_discovered_fields)
  and (select count(*) = 0 from public.marketing_systeme_contact_fields)
  and (select count(*) = 0 from public.marketing_systeme_event_context), 'no cross-PM discovery, answers or event details');
select set_config('leadhost.test_super_admin', 'true', true);
select pg_temp.assert_true((select count(*) = 4 from public.marketing_systeme_flows), 'superadmin metadata support read');
set local role anon;
select pg_temp.expect_error('select * from public.marketing_systeme_flows', '42501');
select pg_temp.expect_error('select * from public.marketing_systeme_field_bindings', '42501');
select pg_temp.expect_error('select * from public.marketing_systeme_discovered_fields', '42501');
select pg_temp.expect_error('select * from public.marketing_systeme_contact_fields', '42501');
select pg_temp.expect_error('select * from public.marketing_systeme_event_context', '42501');
reset role;

-- The new configuration does not redirect imports until a later, explicit engine upgrade.
update public.marketing_systeme_integrations set enabled = true
where id = '10000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(public.import_marketing_systeme_opt_in(
  '10000000-0000-4000-8000-000000000001', '2026-10-15T08:00:00Z', 'legacy-after-extension',
  'CONTACT_OPT_IN', repeat('b',64), null, 'https://example.test/milano',
  '{"external_id":"987","full_name":"Compatibile","email":"compat@example.test"}', null
)->>'status' = 'imported', 'legacy importer still works after extension');
select pg_temp.assert_true((select stage_id = '30000000-0000-4000-8000-000000000001'
  from public.marketing_crm_contacts where email = 'compat@example.test'), 'legacy destination unchanged');
select pg_temp.assert_true((select notes = 'Note originali A' from public.marketing_crm_contacts
  where id = '40000000-0000-4000-8000-000000000001'), 'extra fields do not overwrite notes');
delete from public.marketing_systeme_flows where id = '60000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*) = 0 from public.marketing_systeme_field_bindings), 'deleted flow removes its mappings');
select pg_temp.assert_true((select flow_id is null and flow_name = 'Roma' and value = 'Gestione completa'
  from public.marketing_systeme_contact_fields), 'answers survive removal of the originating flow');
select pg_temp.assert_true((select flow_id is null and flow_name = 'Roma' from public.marketing_systeme_event_context), 'event history survives flow removal');
rollback;
