// Isolated API contract tests. No environment credentials, network or database writes.
// Run: node --experimental-vm-modules --test scripts/test-systeme-api.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
import { z } from 'zod';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ownerA = '10000000-0000-4000-8000-000000000001';
const ownerB = '10000000-0000-4000-8000-000000000002';
const contactA = '20000000-0000-4000-8000-000000000001';
const contactB = '20000000-0000-4000-8000-000000000002';
const integrationA = '30000000-0000-4000-8000-000000000001';
const integrationB = '30000000-0000-4000-8000-000000000002';

class AdminApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function harness() {
  const queries = [], rpcCalls = [], logs = [], audits = [];
  const state = { failTable: null, outcome: 'saved' };
  const identities = {
    'test-a': { profile: { id: ownerA, status: 'active' }, roles: ['property_manager'] },
    'test-b': { profile: { id: ownerB, status: 'active' }, roles: ['property_manager'] },
    'test-inactive': { profile: { id: ownerA, status: 'suspended' }, roles: ['property_manager'] },
    'test-staff': { profile: { id: ownerA, status: 'active' }, roles: ['moderator'] },
    'test-no-addon': { profile: { id: '10000000-0000-4000-8000-000000000003', status: 'active' }, roles: ['property_manager'] },
  };
  const rows = {
    marketing_crm_contacts: [{ id: contactA, profile_id: ownerA }, { id: contactB, profile_id: ownerB }],
    marketing_systeme_integrations: [{ id: integrationA, profile_id: ownerA }, { id: integrationB, profile_id: ownerB }],
    marketing_systeme_contact_fields: [
      { id: 'answer-a', profile_id: ownerA, crm_contact_id: contactA, flow_name: 'Milano', label: 'Zona', value: 'Centro' },
      { id: 'answer-b', profile_id: ownerB, crm_contact_id: contactB, flow_name: 'Roma', label: 'Zona', value: 'EUR' },
      { id: 'wrong-owner', profile_id: ownerB, crm_contact_id: contactA, flow_name: 'Other', label: 'Private', value: 'Do not disclose' },
    ],
  };
  function snapshot() {
    return { routingMode: 'flows', enabled: false, updatedAt: '2026-10-16T00:00:00Z',
      configurationRevision: '9', configurationToken: 'a'.repeat(32), discoveryExpiresAt: null, flows: [] };
  }
  const client = {
    from(table) {
      const q = { table, filters: [], range: null, orders: [] };
      queries.push(q);
      const result = () => {
        if (state.failTable === table) return { data: null, error: new Error('Private database detail') };
        if (table === 'addon_products') {
          const profile = q.filters.find(([key]) => key === 'addon_subscriptions.profile_id')?.[1];
          const active = [ownerA, ownerB].includes(profile);
          return { error: null, data: { id: 'marketing', status: 'active', is_menu_visible: true,
            features: [], addon_subscriptions: active ? [{ source: 'manual', status: 'active', access_expires_at: null }] : [] } };
        }
        const found = (rows[table] ?? []).filter(row => q.filters.every(([key, value]) => row[key] === value));
        return { data: q.range ? found.slice(q.range[0], q.range[1] + 1) : found, count: found.length, error: null };
      };
      const builder = {
        select() { return this; },
        eq(key, value) { q.filters.push([key, value]); return this; },
        in() { return this; },
        order(key) { q.orders.push(key); return this; },
        range(start, end) { q.range = [start, end]; return this; },
        async maybeSingle() { const r = result(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; },
        then(fulfilled, rejected) { return Promise.resolve(result()).then(fulfilled, rejected); },
      };
      return builder;
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args: { ...args } });
      assert.equal(args.p_integration_id, args.p_profile_id === ownerA ? integrationA : integrationB);
      if (name === 'marketing_systeme_flow_snapshot') return { data: snapshot(), error: null };
      if (name === 'marketing_systeme_discovery_catalog') return { data: [], error: null };
      if (name === 'configure_marketing_systeme_flows') return { data: { status: state.outcome, snapshot: snapshot() }, error: null };
      throw new Error('Unexpected RPC');
    },
  };
  const context = createContext({ URL, console: { error: (...args) => logs.push(args.join(' ')) } });
  const modules = new Map();
  async function synthetic(name, exports) {
    const dependency = new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context, identifier: name });
    await dependency.link(() => { throw new Error('Synthetic module has no imports'); });
    await dependency.evaluate();
    return dependency;
  }
  async function load(relative) {
    const path = resolve(root, relative);
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(await readFile(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, fileName: path,
    }).outputText;
    const compiled = new SourceTextModule(code, { context, identifier: path });
    modules.set(path, compiled);
    await compiled.link(async specifier => {
      if (specifier === '@/lib/addons/access') return load('src/lib/addons/access.ts');
      if (specifier === '@/lib/marketing/systeme/flows') return load('src/lib/marketing/systeme/flows.ts');
      if (specifier === './payload') return load('src/lib/marketing/systeme/payload.ts');
      const exports = {
        'next/server': { NextResponse },
        zod: { z },
        react: { cache: fn => fn },
        '@/lib/admin/auth': { AdminApiError },
        '@/lib/auth/profile-context': { getAuthenticatedProfileContext: async token => identities[token] ?? null },
        '@/lib/supabase/server': { createServiceSupabaseClient: () => client },
        '@/lib/admin/audit': { writeAdminAuditLog: async entry => audits.push(entry) },
        '@/lib/env': { getEnv: () => undefined },
        '@/lib/marketing/systeme/crypto': { decryptSystemeSecret: () => { throw new Error('No test secret'); } },
      }[specifier];
      assert.ok(exports, `Unexpected dependency: ${specifier}`);
      return synthetic(specifier, exports);
    });
    return compiled;
  }
  const answers = await load('src/app/api/marketing/crm/systeme-fields/route.ts');
  await answers.evaluate();
  const flows = await load('src/app/api/marketing/integrations/systeme/flows/route.ts');
  await flows.evaluate();
  function request(path, token, body) {
    return new NextRequest(`https://example.test${path}`, {
      method: body ? 'PATCH' : 'GET',
      headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  return { answers: answers.namespace, flows: flows.namespace, queries, rpcCalls, logs, audits, state, request };
}

for (const [token, expected] of [[null, 401], ['invalid', 401], ['test-inactive', 401], ['test-staff', 403], ['test-no-addon', 403]]) {
  test(`answers and flows reject identity ${token ?? 'missing'} with ${expected}`, async () => {
    const h = await harness();
    for (const api of [h.answers, h.flows]) {
      const response = await api.GET(h.request(`/api/test?contactId=${contactA}`, token));
      assert.equal(response.status, expected);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal(h.queries.some(q => q.table !== 'addon_products'), false);
    assert.equal(h.rpcCalls.length, 0);
  });
}

test('each PM reads only its own answers; spoofed profile and contact parameters do not change ownership', async () => {
  const h = await harness();
  for (const [token, contactId, profile, value] of [['test-a', contactA, ownerA, 'Centro'], ['test-b', contactB, ownerB, 'EUR']]) {
    const response = await h.answers.GET(h.request(`/api/test?contactId=${contactId}&profileId=${profile === ownerA ? ownerB : ownerA}`, token));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { fields: [{ id: profile === ownerA ? 'answer-a' : 'answer-b', flowName: profile === ownerA ? 'Milano' : 'Roma', label: 'Zona', value }], page: 1, total: 1 });
    const query = h.queries.filter(q => q.table === 'marketing_systeme_contact_fields').at(-1);
    assert.deepEqual(query.filters, [['crm_contact_id', contactId], ['profile_id', profile]]);
    assert.deepEqual(query.orders, ['created_at', 'id']);
  }
  const before = h.queries.filter(q => q.table === 'marketing_systeme_contact_fields').length;
  const denied = await h.answers.GET(h.request(`/api/test?contactId=${contactA}&profileId=${ownerA}`, 'test-b'));
  assert.equal(denied.status, 404);
  assert.equal(h.queries.filter(q => q.table === 'marketing_systeme_contact_fields').length, before);
  assert.equal(JSON.stringify(await denied.json()).includes('Centro'), false);
});

test('answers validate UUID and page bounds before any contact query', async () => {
  const h = await harness();
  for (const query of ['contactId=invalid', `contactId=${contactA}&page=0`, `contactId=${contactA}&page=1.5`, `contactId=${contactA}&page=10001`]) {
    assert.equal((await h.answers.GET(h.request(`/api/test?${query}`, 'test-a'))).status, 422);
  }
  assert.equal(h.queries.some(q => q.table !== 'addon_products'), false);
});

test('answers paginate 100 at a time and expose no private database errors', async () => {
  const h = await harness();
  const second = await h.answers.GET(h.request(`/api/test?contactId=${contactA}&page=2`, 'test-a'));
  assert.deepEqual(await second.json(), { fields: [], page: 2, total: 1 });
  assert.deepEqual(h.queries.at(-1).range, [100, 199]);
  h.state.failTable = 'marketing_systeme_contact_fields';
  const failed = await h.answers.GET(h.request(`/api/test?contactId=${contactA}`, 'test-a'));
  assert.equal(failed.status, 503);
  assert.equal(JSON.stringify(await failed.json()).includes('Private database detail'), false);
  assert.equal(h.logs.join(' ').includes('Private database detail'), false);
  assert.equal(failed.headers.get('cache-control'), 'no-store');
});

test('flow reads derive integration and RPC owner from the authenticated PM, not URL parameters', async () => {
  const h = await harness();
  const response = await h.flows.GET(h.request(`/api/test?profileId=${ownerA}&integrationId=${integrationA}`, 'test-b'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(h.rpcCalls.map(call => call.args), [
    { p_integration_id: integrationB, p_profile_id: ownerB },
    { p_integration_id: integrationB, p_profile_id: ownerB },
  ]);
});

test('flow writes reject client-supplied ownership fields without calling mutating RPCs', async () => {
  const h = await harness();
  const body = { version: 2, configurationToken: 'a'.repeat(32), profileId: ownerA, command: { action: 'stop_discovery' } };
  assert.equal((await h.flows.PATCH(h.request('/api/test', 'test-b', body))).status, 422);
  assert.equal(h.rpcCalls.length, 0);
  assert.equal(h.audits.length, 0);
});

test('flow writes bind the server owner and stale conflicts produce no success audit', async () => {
  const h = await harness();
  const body = { version: 2, configurationToken: 'a'.repeat(32), command: { action: 'stop_discovery' } };
  const response = await h.flows.PATCH(h.request('/api/test', 'test-b', body));
  assert.equal(response.status, 200);
  assert.equal(h.rpcCalls[0].args.p_profile_id, ownerB);
  assert.equal(h.rpcCalls[0].args.p_integration_id, integrationB);
  assert.equal(h.audits[0].actorProfileId, ownerB);
  h.state.outcome = 'conflict';
  assert.equal((await h.flows.PATCH(h.request('/api/test', 'test-b', body))).status, 409);
  assert.equal(h.audits.length, 1);
});

test('activation without a configured secret is rejected before any mutating RPC', async () => {
  const h = await harness();
  const response = await h.flows.PATCH(h.request('/api/test', 'test-a', {
    version: 2, configurationToken: 'a'.repeat(32), command: { action: 'set_enabled', enabled: true },
  }));
  assert.equal(response.status, 422);
  assert.equal(h.rpcCalls.length, 0);
});
