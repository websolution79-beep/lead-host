-- Read-only verification after migration 202610150004. No import/configuration RPC calls.
with backend_functions as (
  select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('marketing_systeme_owner_has_access','marketing_systeme_flow_snapshot',
    'marketing_systeme_discovery_catalog','configure_marketing_systeme_flows','import_marketing_systeme_opt_in_legacy',
    'import_marketing_systeme_opt_in','import_marketing_systeme_flow_opt_in','marketing_systeme_guard_legacy_settings','marketing_systeme_lock_flow_config')
), extension_tables as (
  select c.oid,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('marketing_systeme_flows','marketing_systeme_field_bindings',
    'marketing_systeme_discovered_fields','marketing_systeme_contact_fields','marketing_systeme_event_context')
)
select '01 - Funzioni backend' as controllo, count(*)::text || ' / 9' as risultato from backend_functions
union all select '02 - Esecuzione anonima negata', count(*) filter(where not has_function_privilege('anon',oid,'execute'))::text || ' / 9' from backend_functions
union all select '03 - Esecuzione browser negata', count(*) filter(where not has_function_privilege('authenticated',oid,'execute'))::text || ' / 9' from backend_functions
union all select '04 - Esecuzione server consentita', count(*) filter(where has_function_privilege('service_role',oid,'execute'))::text || ' / 9' from backend_functions
union all select '05 - Tabelle con RLS invariata', count(*) filter(where relrowsecurity)::text || ' / 5' from extension_tables
union all select '06 - Lettura anonima tabelle negata', count(*) filter(where not has_table_privilege('anon',oid,'select'))::text || ' / 5' from extension_tables
union all select '07 - Scritture browser tabelle negate', count(*) filter(where not has_table_privilege('authenticated',oid,'insert,update,delete'))::text || ' / 5' from extension_tables
union all select '08 - Guard e lock trigger attivi', count(*)::text || ' / 3' from pg_trigger where not tgisinternal and tgenabled='O'
  and tgname in ('marketing_systeme_guard_legacy_settings','marketing_systeme_binding_config_lock','marketing_systeme_flow_delete_lock')
union all select '09 - Revisione iniziale collegamenti', string_agg(configuration_revision::text,', ' order by id) from public.marketing_systeme_integrations
union all select '10 - Importatore originale preservato', md5(replace(btrim(prosrc), E'\r', '')) from pg_proc
  where oid=to_regprocedure('public.import_marketing_systeme_opt_in_legacy(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text)')
union all select '11 - Collegamenti totali / attivi', count(*)::text || ' / ' || count(*) filter(where enabled)::text from public.marketing_systeme_integrations
union all select '12 - Modalita collegamento pilota', routing_mode from public.marketing_systeme_integrations where id='983bf974-667a-4367-98da-2ce18a40883c'
union all select '13 - Discovery attive', count(*)::text from public.marketing_systeme_integrations where discovery_expires_at is not null
union all select '14 - Flussi totali / attivi', count(*)::text || ' / ' || count(*) filter(where enabled)::text from public.marketing_systeme_flows
union all select '15 - Contatti CRM', count(*)::text from public.marketing_crm_contacts
union all select '16 - Eventi webhook', count(*)::text from public.marketing_systeme_webhook_events
union all select '17 - Dati estensioni', ((select count(*) from public.marketing_systeme_field_bindings)
+(select count(*) from public.marketing_systeme_discovered_fields)+(select count(*) from public.marketing_systeme_contact_fields)
+(select count(*) from public.marketing_systeme_event_context))::text
union all select '18 - Impronta contatti', md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'[]')) from public.marketing_crm_contacts c
union all select '19 - Impronta collegamenti', md5(coalesce(jsonb_agg(to_jsonb(i)-'configuration_revision' order by i.id)::text,'[]')) from public.marketing_systeme_integrations i
union all select '20 - Impronta flussi', md5(coalesce(jsonb_agg(to_jsonb(f) order by f.id)::text,'[]')) from public.marketing_systeme_flows f
union all select '21 - Impronta eventi', md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text,'[]')) from public.marketing_systeme_webhook_events e
union all select '22 - Impronta segreti cifrati', md5(coalesce(jsonb_agg(to_jsonb(s) order by s.integration_id)::text,'[]')) from public.marketing_systeme_webhook_secrets s
order by controllo;
