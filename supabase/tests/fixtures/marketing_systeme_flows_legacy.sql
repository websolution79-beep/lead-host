do $$ begin
  if current_setting('leadhost.isolated_schema_test', true) is distinct from 'true' then
    raise exception 'This fixture requires an isolated test database';
  end if;
end; $$;

insert into public.user_roles (profile_id, role) values
  ('00000000-0000-4000-8000-000000000001', 'property_manager'),
  ('00000000-0000-4000-8000-000000000002', 'property_manager');
insert into public.addon_products (id, slug) values ('50000000-0000-4000-8000-000000000001', 'marketing');
insert into public.addon_subscriptions (addon_product_id, profile_id, source, status) values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'manual', 'active'),
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'manual', 'active');
insert into public.marketing_crm_pipelines (id, profile_id, is_default) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', true),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', true);
insert into public.marketing_crm_stages (id, pipeline_id, name) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Lead Milano'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Lead altro PM'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Lead Roma');
insert into public.marketing_crm_contacts (id, profile_id, pipeline_id, stage_id, full_name, notes) values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Contatto originale A', 'Note originali A'),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'Contatto originale B', 'Note originali B');
insert into public.marketing_systeme_integrations (id, profile_id, enabled, import_mode, allowed_page_urls, destination_stage_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', false, 'selected_pages', array['https://example.test/milano'], '30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', true, 'all', '{}', '30000000-0000-4000-8000-000000000002');
insert into public.marketing_systeme_webhook_secrets (integration_id, encrypted_secret, rotated_at) values
  ('10000000-0000-4000-8000-000000000001', repeat('fixture-', 8), '2026-10-15T08:00:00Z'),
  ('10000000-0000-4000-8000-000000000002', repeat('fixture-', 8), '2026-10-15T08:00:00Z');
create table public.leadhost_test_flow_baseline as select
  (select prosrc from pg_proc where oid = 'public.import_marketing_systeme_opt_in(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text)'::regprocedure) as importer_source,
  (select jsonb_agg(to_jsonb(c) order by c.id) from public.marketing_crm_contacts c) as contacts,
  (select jsonb_agg(to_jsonb(c) order by c.id) from public.marketing_systeme_integrations c) as connections,
  (select jsonb_agg(to_jsonb(s) order by s.integration_id) from public.marketing_systeme_webhook_secrets s) as secrets;
