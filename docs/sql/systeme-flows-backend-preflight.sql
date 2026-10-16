-- Read-only preflight. Never execute fixture/test SQL in production.
select '01 - Colonna revisione gia presente' as controllo, count(*)::text as risultato
from information_schema.columns where table_schema='public' and table_name='marketing_systeme_integrations' and column_name='configuration_revision'
union all select '02 - Funzioni backend gia presenti', count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('marketing_systeme_owner_has_access','marketing_systeme_flow_snapshot',
'marketing_systeme_discovery_catalog','configure_marketing_systeme_flows','import_marketing_systeme_opt_in_legacy',
'import_marketing_systeme_flow_opt_in','marketing_systeme_guard_legacy_settings','marketing_systeme_lock_flow_config')
union all select '03 - Impronta importatore originale', md5(replace(btrim(prosrc), E'\r', '')) from pg_proc
where oid=to_regprocedure('public.import_marketing_systeme_opt_in(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text)')
union all select '04 - Collegamenti totali / attivi', count(*)::text || ' / ' || count(*) filter(where enabled)::text from public.marketing_systeme_integrations
union all select '05 - Modalita collegamento pilota', routing_mode from public.marketing_systeme_integrations where id='983bf974-667a-4367-98da-2ce18a40883c'
union all select '06 - Discovery attive', count(*)::text from public.marketing_systeme_integrations where discovery_expires_at is not null
union all select '07 - Flussi totali / attivi', count(*)::text || ' / ' || count(*) filter(where enabled)::text from public.marketing_systeme_flows
union all select '08 - Contatti CRM', count(*)::text from public.marketing_crm_contacts
union all select '09 - Eventi webhook', count(*)::text from public.marketing_systeme_webhook_events
union all select '10 - Dati estensioni', ((select count(*) from public.marketing_systeme_field_bindings)
+(select count(*) from public.marketing_systeme_discovered_fields)+(select count(*) from public.marketing_systeme_contact_fields)
+(select count(*) from public.marketing_systeme_event_context))::text
union all select '11 - Impronta contatti', md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'[]')) from public.marketing_crm_contacts c
union all select '12 - Impronta collegamenti', md5(coalesce(jsonb_agg(to_jsonb(i)-'configuration_revision' order by i.id)::text,'[]')) from public.marketing_systeme_integrations i
union all select '13 - Impronta flussi', md5(coalesce(jsonb_agg(to_jsonb(f) order by f.id)::text,'[]')) from public.marketing_systeme_flows f
union all select '14 - Impronta eventi', md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text,'[]')) from public.marketing_systeme_webhook_events e
union all select '15 - Impronta segreti cifrati', md5(coalesce(jsonb_agg(to_jsonb(s) order by s.integration_id)::text,'[]')) from public.marketing_systeme_webhook_secrets s
order by controllo;
