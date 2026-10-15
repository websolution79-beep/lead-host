// Read-only rollout check. Run with node --env-file=.env.local; never print credentials or contact values.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, 'gkksbudobesjmljkkjtr.supabase.co', 'Unexpected Supabase project');
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(serviceKey && publicKey, 'Missing Supabase environment configuration');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, options);
const anonymous = createClient(url, publicKey, options);
const integrationId = '983bf974-667a-4367-98da-2ce18a40883c';

function success(result) {
  assert.equal(result.error, null, `Read-only API check failed (${result.error?.code || result.status})`);
  return result.data;
}

const connection = success(await service.from('marketing_systeme_integrations')
  .select('profile_id,routing_mode,enabled,configuration_revision,discovery_expires_at').eq('id', integrationId).single());
assert.equal(connection.routing_mode, 'legacy');
assert.equal(connection.enabled, false);
assert.equal(connection.configuration_revision, 0);
assert.equal(connection.discovery_expires_at, null);
const args = { p_integration_id: integrationId, p_profile_id: connection.profile_id };
const snapshot = success(await service.rpc('marketing_systeme_flow_snapshot', args));
assert.equal(snapshot.routingMode, 'legacy');
assert.equal(snapshot.enabled, false);
assert.equal(snapshot.configurationRevision, '0');
assert.equal(snapshot.discoveryExpiresAt, null);
assert.equal(snapshot.flows.length, 1);
assert.ok(snapshot.flows.every((flow) => !flow.enabled));
assert.match(snapshot.configurationToken, /^[a-f0-9]{32}$/);
const catalog = success(await service.rpc('marketing_systeme_discovery_catalog', args));
assert.deepEqual(catalog, []);
const denied = [];
for (const rpc of ['marketing_systeme_flow_snapshot', 'marketing_systeme_discovery_catalog']) {
  const result = await anonymous.rpc(rpc, args);
  assert.equal(result.error?.code, '42501', 'Anonymous RPC execution must be denied');
  assert.ok(result.status === 401 || result.status === 403, 'Unexpected denial status');
  denied.push({ rpc, status: result.status });
}
console.log(JSON.stringify({ snapshotAvailable: true, catalogAvailable: true, legacyConnectionPaused: true,
  revision: snapshot.configurationRevision, pausedFlowCount: snapshot.flows.length,
  discoveryDisabled: true, knownFieldCount: catalog.length, anonymousReadRpcDenials: denied }, null, 2));
