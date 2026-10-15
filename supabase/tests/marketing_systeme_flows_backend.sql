do $$ begin
  if current_setting('leadhost.isolated_schema_test', true) is distinct from 'true' then raise exception 'Isolated database required'; end if;
end; $$;
begin;
create function pg_temp.assert_true(p_value boolean, p_message text) returns void language plpgsql as $$ begin
  if p_value is distinct from true then raise exception 'Assertion failed: %', p_message; end if;
end; $$;
create function pg_temp.snapshot() returns jsonb language sql as $$
  select public.marketing_systeme_flow_snapshot('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
$$;
create function pg_temp.save(p_command jsonb) returns jsonb language sql as $$
  select public.configure_marketing_systeme_flows('10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', pg_temp.snapshot()->>'configurationToken', p_command);
$$;
create function pg_temp.milan_id() returns uuid language sql as $$
  select id from public.marketing_systeme_flows where integration_id = '10000000-0000-4000-8000-000000000001' and import_mode = 'selected_pages';
$$;
create function pg_temp.flow_command(p_id uuid, p_name text, p_url text, p_stage uuid, p_enabled boolean default true) returns jsonb language sql as $$
  select jsonb_build_object('action','save_flow','flow',jsonb_build_object(
    'id',p_id,'name',p_name,'enabled',p_enabled,'importMode',case when p_url is null then 'all' else 'selected_pages' end,
    'allowedPageUrls',case when p_url is null then '[]'::jsonb else jsonb_build_array(p_url) end,'destinationStageId',p_stage,
    'bindings','[{"sourceSlug":"first_name","targetField":"first_name","additionalLabel":null},
      {"sourceSlug":"email","targetField":"email","additionalLabel":null},
      {"sourceSlug":"rooms","targetField":"bedrooms","additionalLabel":null},
      {"sourceSlug":"preference","targetField":"additional","additionalLabel":"Preferenze"}]'::jsonb));
$$;
create function pg_temp.import_case(p_message text, p_page text default 'https://example.test/milano',
  p_contact jsonb default '{"external_id":"123","full_name":"Mario Rossi","email":"lead@example.test","bedrooms":0,"city":"Milano"}',
  p_answers jsonb default '[]', p_warnings jsonb default '[]', p_metadata jsonb default '[]', p_rejection text default null
) returns jsonb language sql as $$
  select public.import_marketing_systeme_flow_opt_in('10000000-0000-4000-8000-000000000001','2026-10-15T08:00:00Z',
    pg_temp.snapshot()->>'configurationToken',p_message,'CONTACT_OPT_IN',repeat('a',64),null,p_page,
    (select id from public.marketing_systeme_flows where integration_id = '10000000-0000-4000-8000-000000000001'
      and (import_mode='all' or p_page=any(allowed_page_urls)) order by case when import_mode='selected_pages' then 0 else 1 end limit 1),
    p_contact,p_answers,p_warnings,p_metadata,p_rejection);
$$;

select pg_temp.assert_true((select jsonb_agg(to_jsonb(c) order by c.id) from public.marketing_crm_contacts c)
  = (select contacts from public.leadhost_test_flow_baseline), 'migration leaves existing CRM untouched');
select pg_temp.assert_true((select prosrc from pg_proc where oid =
  'public.import_marketing_systeme_opt_in_legacy(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text)'::regprocedure)
  = (select importer_source from public.leadhost_test_flow_baseline), 'original importer preserved intact');
select pg_temp.assert_true(pg_temp.snapshot()->>'routingMode' = 'legacy' and (pg_temp.snapshot()->>'enabled')::boolean = false,
  'migration does not enable or switch connections');
select pg_temp.assert_true(public.marketing_systeme_flow_snapshot('10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002') is null, 'snapshot requires matching owner');
select pg_temp.assert_true(public.configure_marketing_systeme_flows('10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002','wrong','{"action":"set_enabled","enabled":true}')->>'status' = 'not_found', 'wrong owner cannot configure');
select pg_temp.assert_true(public.configure_marketing_systeme_flows('10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001','stale','{"action":"set_enabled","enabled":true}')->>'status' = 'conflict', 'stale config rejected');

select pg_temp.assert_true(pg_temp.save(pg_temp.flow_command(pg_temp.milan_id(),'Milano','https://example.test/milano',
  '30000000-0000-4000-8000-000000000001'))->>'status' = 'saved', 'atomic first flow save');
select pg_temp.assert_true(pg_temp.snapshot()->>'routingMode' = 'flows' and not (pg_temp.snapshot()->>'enabled')::boolean,
  'first flows save switches mode but keeps import paused');
select pg_temp.assert_true(public.import_marketing_systeme_opt_in('10000000-0000-4000-8000-000000000001',
  '2026-10-15T08:00:00Z','legacy-cannot-bypass','CONTACT_OPT_IN',repeat('b',64))->>'reason' = 'configuration_changed', 'legacy RPC cannot bypass flows');
select pg_temp.assert_true(not exists(select 1 from public.marketing_systeme_webhook_events where message_id='legacy-cannot-bypass'), 'guard has no import side effects');
do $$ begin
  begin
    update public.marketing_systeme_integrations set enabled=true where id='10000000-0000-4000-8000-000000000001';
    raise exception 'Expected old-client write guard'; exception when invalid_parameter_value then null;
  end;
  perform pg_temp.assert_true(not (pg_temp.snapshot()->>'enabled')::boolean,'old client cannot silently enable flows');
end; $$;

do $$ declare before_state jsonb; command jsonb; begin
  before_state := pg_temp.snapshot();
  command := pg_temp.flow_command(pg_temp.milan_id(),'Changed name','https://example.test/milano','30000000-0000-4000-8000-000000000001');
  command := jsonb_set(command,'{flow,bindings}',(command#>'{flow,bindings}') || (command#>'{flow,bindings,0}'));
  begin perform pg_temp.save(command); raise exception 'Expected duplicate binding failure'; exception when unique_violation then null; end;
  perform pg_temp.assert_true(pg_temp.snapshot() = before_state,'failed mapping save rolls back flow name/settings/bindings');
  begin
    perform pg_temp.save(pg_temp.flow_command(pg_temp.milan_id(),'Cross-owner','https://example.test/milano','30000000-0000-4000-8000-000000000002'));
    raise exception 'Expected destination ownership failure'; exception when invalid_parameter_value then null;
  end;
  perform pg_temp.assert_true(pg_temp.snapshot() = before_state,'foreign stage save has no side effects');
end; $$;

select pg_temp.assert_true(pg_temp.save(pg_temp.flow_command('70000000-0000-4000-8000-000000000002','Roma','https://example.test/roma',
  '30000000-0000-4000-8000-000000000003'))->>'status' = 'saved', 'second independent flow saved');
select pg_temp.assert_true(pg_temp.save('{"action":"set_enabled","enabled":true}')->>'status' = 'saved','explicit activation after configuration');
select pg_temp.assert_true(pg_temp.import_case('milan')->>'status' = 'imported','Milan import');
select pg_temp.assert_true(pg_temp.import_case('milan')->>'status' = 'duplicate','duplicate delivery');
select pg_temp.assert_true(public.import_marketing_systeme_flow_opt_in('10000000-0000-4000-8000-000000000001',
  '2026-10-15T08:00:00Z',pg_temp.snapshot()->>'configurationToken','bad-envelope','CONTACT_OPT_IN',repeat('a',64),
  null,'https://example.test/milano',null,null,'[]','[]','[]','invalid_payload')->>'reason'='invalid_payload',
  'invalid envelope is a permanent rejection, not a stale-flow retry');
select pg_temp.assert_true((select s.name='Lead Milano' and c.bedrooms=0 from public.marketing_crm_contacts c
  join public.marketing_crm_stages s on s.id=c.stage_id where c.email='lead@example.test'),'Milan stage and zero rooms preserved');
select pg_temp.assert_true(pg_temp.import_case('rome','https://example.test/roma',
  '{"external_id":"456","full_name":"Anna Rossi","email":"rome@example.test"}')->>'status'='imported','Rome import');
select pg_temp.assert_true((select stage_id='30000000-0000-4000-8000-000000000003' from public.marketing_crm_contacts
  where email='rome@example.test'),'Rome stage independent');
select pg_temp.assert_true(pg_temp.import_case('no-fallback','https://example.test/other')->>'reason'='page_filtered','unknown page ignored without fallback');
select pg_temp.assert_true(public.import_marketing_systeme_flow_opt_in('10000000-0000-4000-8000-000000000001',
  '2026-10-15T08:00:00Z',pg_temp.snapshot()->>'configurationToken','wrong-flow','CONTACT_OPT_IN',repeat('a',64),
  null,'https://example.test/milano','70000000-0000-4000-8000-000000000002',
  '{"external_id":"7","full_name":"No import","email":"no@example.test"}')->>'reason'='configuration_changed','database checks source routing instead of trusting the supplied flow');
select pg_temp.assert_true(not exists(select 1 from public.marketing_systeme_webhook_events where message_id='wrong-flow'),'wrong flow has no side effects');
select pg_temp.assert_true(pg_temp.import_case('sensitive-key',p_contact=>
  '{"external_id":"8","full_name":"No import","email":"no@example.test","notes":"Do not write"}')->>'reason'='invalid_payload',
  'operational contact keys rejected by persistence too');

do $$ declare old_token text; result jsonb; begin
  old_token := pg_temp.snapshot()->>'configurationToken';
  perform pg_temp.save('{"action":"set_enabled","enabled":true}');
  result := public.import_marketing_systeme_flow_opt_in('10000000-0000-4000-8000-000000000001',
    '2026-10-15T08:00:00Z',old_token,'stale-snapshot','CONTACT_OPT_IN',repeat('a',64));
  perform pg_temp.assert_true(result->>'reason'='configuration_changed' and (result->>'retryable')::boolean,'stale snapshot asks for retry');
  perform pg_temp.assert_true(not exists(select 1 from public.marketing_systeme_webhook_events where message_id='stale-snapshot'),'stale mapping creates no event/contact');
end; $$;

-- Existing manual work and identity survive a second landing/flow.
update public.marketing_crm_contacts set full_name='Nome scelto dal PM',notes='Nota privata',next_follow_up_at='2026-11-01T12:00:00Z',
  stage_id='30000000-0000-4000-8000-000000000003',city=null,bedrooms=0 where email='lead@example.test';
select pg_temp.assert_true(pg_temp.import_case('same-contact-other-flow','https://example.test/roma',
  '{"external_id":"123","full_name":"Do not replace","email":"new@example.test","bedrooms":4,"city":"Roma"}')->>'status'='updated','external identity shared across flows');
select pg_temp.assert_true((select full_name='Nome scelto dal PM' and notes='Nota privata' and bedrooms=0 and city='Roma'
  and email='lead@example.test' and stage_id='30000000-0000-4000-8000-000000000003' and next_follow_up_at='2026-11-01T12:00:00Z'
  from public.marketing_crm_contacts where email='lead@example.test'),'manual name/stage/notes/followup/nonempty values preserved');
select pg_temp.assert_true((select count(*)=1 from public.marketing_systeme_contact_links where external_contact_id='123'),'one external identity across flows');

select pg_temp.assert_true(pg_temp.import_case('extra-answer',p_answers=>jsonb_build_array(jsonb_build_object(
  'fieldKey',pg_temp.milan_id()::text||':preference','label','Preferenze','value','Centro')))->>'status'='updated','extra answer saved');
select pg_temp.assert_true(pg_temp.import_case('extra-no-overwrite',p_answers=>jsonb_build_array(jsonb_build_object(
  'fieldKey',pg_temp.milan_id()::text||':preference','label','Preferenze','value','Other')))->>'status'='updated','repeat extra answer accepted');
select pg_temp.assert_true((select value='Centro' from public.marketing_systeme_contact_fields where label='Preferenze'),'existing extra answer not overwritten');

-- Force a late write failure: neither new contact nor identity link may survive.
create function pg_temp.reject_context() returns trigger language plpgsql as $$ begin
  if exists(select 1 from public.marketing_systeme_webhook_events where id=new.event_id and message_id='late-failure') then
    raise exception 'Simulated context failure'; end if; return new;
end; $$;
create trigger reject_context before insert on public.marketing_systeme_event_context for each row execute function pg_temp.reject_context();
select pg_temp.assert_true(pg_temp.import_case('late-failure',p_contact=>'{"external_id":"999","full_name":"Rollback","email":"rollback@example.test"}',
  p_answers=>jsonb_build_array(jsonb_build_object('fieldKey',pg_temp.milan_id()::text||':preference','label','Preferenze','value','Rollback')))->>'reason'='import_failed','late failure recorded retryable');
select pg_temp.assert_true(not exists(select 1 from public.marketing_crm_contacts where email='rollback@example.test')
  and not exists(select 1 from public.marketing_systeme_contact_links where external_contact_id='999')
  and not exists(select 1 from public.marketing_systeme_contact_fields where value='Rollback'),'contact/link/answers roll back together');
drop trigger reject_context on public.marketing_systeme_event_context;
select pg_temp.assert_true(pg_temp.import_case('late-failure',p_contact=>'{"external_id":"999","full_name":"Rollback","email":"rollback@example.test"}')->>'status'='imported','same failed message recovers');

select pg_temp.assert_true(pg_temp.save(pg_temp.flow_command('70000000-0000-4000-8000-000000000003','Fallback',null,null))->>'status'='saved','fallback created');
select pg_temp.assert_true(pg_temp.save(pg_temp.flow_command('70000000-0000-4000-8000-000000000002','Roma','https://example.test/roma',
  '30000000-0000-4000-8000-000000000003',false))->>'status'='saved','pause specific flow');
select pg_temp.assert_true(pg_temp.import_case('paused-rome','https://example.test/roma')->>'reason'='flow_paused','paused page cannot enter fallback');
select pg_temp.assert_true(pg_temp.import_case('fallback','https://example.test/other')->>'status'='updated','unclaimed page uses fallback');
select pg_temp.assert_true(pg_temp.save('{"action":"set_enabled","enabled":false}')->>'status'='saved','parent pause');
select pg_temp.assert_true(pg_temp.import_case('parent-paused')->>'reason'='connection_disabled','parent pause overrides flows');

-- Discovery is opt-in, bounded and value-free, including while imports are paused.
select pg_temp.assert_true(pg_temp.import_case('discovery-off',p_metadata=>'[{"sourceSlug":"city","fieldLabel":"Citta"}]')->>'status'='ignored','paused event acknowledged');
select pg_temp.assert_true((select count(*)=0 from public.marketing_systeme_discovered_fields),'no metadata without explicit window');
select pg_temp.assert_true(pg_temp.save('{"action":"start_discovery","minutes":15}')->>'status'='saved','explicit discovery window');
select pg_temp.assert_true(pg_temp.import_case('discover-paused',p_contact=>null,p_metadata=>'[{"sourceSlug":"city","fieldLabel":"Citta"},
  {"sourceSlug":"private","fieldLabel":"Private","value":"must not persist"}]',p_rejection=>'missing_name')->>'status'='ignored','nameless discovery works while paused');
select pg_temp.assert_true((select count(*)=1 from public.marketing_systeme_discovered_fields where source_slug='city'),'only value-free allowed metadata stored');
select pg_temp.assert_true(jsonb_array_length(public.marketing_systeme_discovery_catalog('10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001'))=1,'owner can read bounded catalog');
select pg_temp.assert_true(public.marketing_systeme_discovery_catalog('10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002')='[]'::jsonb,'catalog cannot cross tenant boundaries');
update public.profiles set status='suspended' where id='00000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(pg_temp.import_case('discovery-suspended',p_metadata=>'[{"sourceSlug":"new_field","fieldLabel":"No"}]')->>'reason'='profile_inactive','suspended account denied');
select pg_temp.assert_true(not exists(select 1 from public.marketing_systeme_discovered_fields where source_slug='new_field'),'no discovery for suspended account');
update public.profiles set status='active';
update public.addon_subscriptions set access_expires_at=now()-interval '1 day' where profile_id='00000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(pg_temp.import_case('discovery-expired',p_metadata=>'[{"sourceSlug":"new_field","fieldLabel":"No"}]')->>'reason'='marketing_access_required','expired addon denied');
select pg_temp.assert_true(pg_temp.save('{"action":"start_discovery","minutes":15}')->>'status'='access_denied','expired owner cannot configure');
update public.addon_subscriptions set access_expires_at=null;
select pg_temp.assert_true(pg_temp.save('{"action":"stop_discovery"}')->>'status'='saved','stop discovery');
select pg_temp.assert_true(pg_temp.import_case('discovery-stopped',p_metadata=>'[{"sourceSlug":"new_field","fieldLabel":"No"}]')->>'status'='ignored','stopped discovery event acknowledged');
select pg_temp.assert_true(not exists(select 1 from public.marketing_systeme_discovered_fields where source_slug='new_field'),'stopped window stores nothing');
select pg_temp.assert_true(pg_temp.save('{"action":"start_discovery","minutes":15}')->>'status'='saved','restart discovery for limit checks');
select pg_temp.assert_true(pg_temp.import_case('unsupported-discovery',p_metadata=>'[{"sourceSlug":"unsupported_field","fieldLabel":"No"}]',
  p_rejection=>'unsupported_schema')->>'status'='ignored','unsupported-schema delivery acknowledged while paused');
select pg_temp.assert_true(not exists(select 1 from public.marketing_systeme_discovered_fields where source_slug='unsupported_field'),'unsupported schema cannot discover');
update public.marketing_systeme_integrations set discovery_expires_at=now()-interval '1 minute' where id='10000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(pg_temp.import_case('expired-discovery',p_metadata=>'[{"sourceSlug":"expired_field","fieldLabel":"No"}]')->>'status'='ignored','expired window delivery acknowledged');
select pg_temp.assert_true(not exists(select 1 from public.marketing_systeme_discovered_fields where source_slug='expired_field'),'expired window stores nothing');
select pg_temp.assert_true(pg_temp.save('{"action":"start_discovery","minutes":15}')->>'status'='saved','new bounded window');
insert into public.marketing_systeme_discovered_fields(integration_id,profile_id,source_page_url,source_slug)
  select '10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','https://example.test/milano','field_'||n
  from generate_series(1,999) n;
select pg_temp.assert_true(pg_temp.import_case('metadata-row-cap',p_metadata=>'[{"sourceSlug":"over_limit","fieldLabel":"No"}]')->>'status'='ignored','row cap does not break webhook acknowledgment');
select pg_temp.assert_true((select count(*)=1000 from public.marketing_systeme_discovered_fields),'metadata row cap enforced');
delete from public.marketing_systeme_discovered_fields;
insert into public.marketing_systeme_discovered_fields(integration_id,profile_id,source_page_url,source_slug)
  select '10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','https://example.test/page-'||n,'name'
  from generate_series(1,50) n;
select pg_temp.assert_true(pg_temp.import_case('metadata-page-cap',p_metadata=>'[{"sourceSlug":"over_page_limit","fieldLabel":"No"}]')->>'status'='ignored','page cap does not break acknowledgment');
select pg_temp.assert_true((select count(distinct source_page_url)=50 and count(*)=50 from public.marketing_systeme_discovered_fields),'metadata page cap enforced');

select pg_temp.assert_true(public.import_marketing_systeme_flow_opt_in('10000000-0000-4000-8000-000000000001',
  '2026-10-15T07:00:00Z',pg_temp.snapshot()->>'configurationToken','stale-secret','CONTACT_OPT_IN',repeat('a',64))->>'status'='stale_secret','secret rotation checked atomically');
select pg_temp.assert_true((select notes='Note originali B' from public.marketing_crm_contacts where id='40000000-0000-4000-8000-000000000002'),'other PM CRM unchanged');
select pg_temp.assert_true(public.import_marketing_systeme_opt_in('10000000-0000-4000-8000-000000000002',
  '2026-10-15T08:00:00Z','legacy-still-works','CONTACT_OPT_IN',repeat('a',64),null,null,
  '{"external_id":"88","full_name":"Legacy Contact","email":"legacy@example.test"}')->>'status'='imported','unchanged legacy connection still imports');

do $$ declare signature text; begin
  foreach signature in array array[
    'marketing_systeme_owner_has_access(uuid)', 'marketing_systeme_flow_snapshot(uuid,uuid)',
    'marketing_systeme_discovery_catalog(uuid,uuid)', 'marketing_systeme_guard_legacy_settings()', 'marketing_systeme_lock_flow_config()',
    'configure_marketing_systeme_flows(uuid,uuid,text,jsonb)',
    'import_marketing_systeme_flow_opt_in(uuid,timestamptz,text,text,text,text,timestamptz,text,uuid,jsonb,jsonb,jsonb,jsonb,text)',
    'import_marketing_systeme_opt_in(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text)',
    'import_marketing_systeme_opt_in_legacy(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text)'
  ] loop
    perform pg_temp.assert_true(not has_function_privilege('anon','public.'||signature,'execute'),'anonymous execution denied: '||signature);
    perform pg_temp.assert_true(not has_function_privilege('authenticated','public.'||signature,'execute'),'browser execution denied: '||signature);
    perform pg_temp.assert_true(has_function_privilege('service_role','public.'||signature,'execute'),'server execution allowed: '||signature);
  end loop;
end; $$;
rollback;
