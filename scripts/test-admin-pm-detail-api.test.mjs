import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
import { z } from 'zod';

const root = resolve(import.meta.dirname, '..');
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const latestId = id(1094);

async function harness({ database, deniedStatus } = {}) {
  const queries = [];
  const authCalls = [];
  const state = { databaseError: null, authError: false, missingAuth: false };
  const rows = {
    user_roles: Array.from({ length: 1094 }, (_, n) => ({ profile_id: id(n + 1), role: 'property_manager' })),
    profiles: [id(1), latestId].map(profileId => ({
      id: profileId, auth_user_id: `auth-${profileId}`, email: 'pm@example.invalid',
      first_name: 'Test', last_name: 'PM', status: 'active', created_at: '2026-11-16T10:00:00Z',
    })),
    property_manager_profiles: [id(1), latestId].map(profileId => ({
      id: `pm-${profileId}`, profile_id: profileId, verification_status: 'verified',
      managed_properties_count: 2, primary_city: 'Roma',
    })),
    wallets: [{ profile_id: latestId, balance_cents: 4200, currency: 'eur' }],
    billing_profiles: [{ profile_id: latestId, subject_type: 'individual', city: 'Roma', country: 'IT' }],
    lead_purchases: [{ id: id(2000), property_manager_id: `pm-${latestId}`, lead_id: id(3000), amount_cents: 5000, mode: 'exclusive', status: 'paid' }],
    reports: [],
    wallet_transactions: [],
    leads: [{ id: id(3000), title: 'Appartamento Test' }],
    payments: [],
  };
  const db = database ?? {
    from(table) {
      const query = { table, filters: [] };
      queries.push(query);
      return {
        select() { return this; },
        eq(key, value) { query.filters.push([key, value]); return this; },
        in(key, values) { query.filters.push([key, values]); return this; },
        order() { return this; },
        then(ok, fail) {
          const error = state.databaseError === table ? { code: '57014' } : null;
          const data = (rows[table] ?? []).filter(row => query.filters.every(([key, value]) =>
            Array.isArray(value) ? value.includes(row[key]) : row[key] === value)).slice(0, 1000);
          return Promise.resolve({ data: error ? null : data, error }).then(ok, fail);
        },
      };
    },
    auth: { admin: {
      listUsers() { throw Error('Detail must not enumerate the Auth archive'); },
      async getUserById(authId) {
        authCalls.push(authId);
        return { data: { user: state.authError ? null : {
          id: authId, user_metadata: { managed_properties_range: 'one_to_three', phone: '3330000000' },
          email_confirmed_at: '2026-11-01T12:00:00Z', last_sign_in_at: '2026-11-16T12:00:00Z',
        } }, error: state.authError ? { code: 'auth_unavailable' } : null };
      },
    } },
  };
  const page = { propertyManagers: [{ profileId: latestId }], pagination: { total: 1094 }, stats: { total: 1094 } };
  const context = createContext({ console });
  const cache = new Map();
  async function load(file) {
    const path = resolve(root, file);
    if (cache.has(path)) return cache.get(path);
    const code = ts.transpileModule(await readFile(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const mod = new SourceTextModule(code, { context, identifier: path });
    cache.set(path, mod);
    await mod.link(async name => {
      const mock = {
        'next/server': { NextResponse, after: () => { throw Error('GET must not schedule writes'); } },
        zod: { z },
        '@/lib/admin/auth': {
          requireSuperAdmin: async request => {
            if (deniedStatus || request.headers.get('authorization') !== 'Bearer admin') throw { status: deniedStatus ?? 401 };
            if (state.missingAuth) rows.profiles.forEach(row => { row.auth_user_id = null; });
            return { supabase: db };
          },
          adminApiErrorResponse: error => NextResponse.json({ error: 'Accesso o lettura non disponibile.' }, { status: error.status ?? 500 }),
        },
        '@/lib/admin/pm-list-page': { fetchPmListPage: async () => page },
        '@/lib/admin/audit': { writeAdminAuditLog: () => { throw Error('GET must not write audit records'); } },
        '@/lib/brevo/worker': { runBrevoWorkerSafely: () => { throw Error('GET must not send emails'); } },
      }[name];
      if (mock) {
        const dep = new SyntheticModule(Object.keys(mock), function () {
          for (const [key, value] of Object.entries(mock)) this.setExport(key, value);
        }, { context });
        await dep.link(() => {});
        return dep;
      }
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
      throw Error(`Unexpected import ${name}`);
    });
    return mod;
  }
  const route = await load('src/app/api/admin/property-managers/route.ts');
  await route.evaluate();
  return {
    queries, authCalls, state, page,
    get: (params = `profileId=${latestId}`, token = 'admin') => route.namespace.GET(new NextRequest(
      `https://example.invalid/api/admin/property-managers?${params}`,
      { headers: token ? { authorization: `Bearer ${token}` } : {} },
    )),
  };
}

test('detail finds a PM beyond 1000 roles and preserves billing, wallet, purchases and Auth metadata', async () => {
  const h = await harness();
  const response = await h.get();
  assert.equal(response.status, 200);
  const { propertyManagers: [pm] } = await response.json();
  assert.equal(pm.profileId, latestId);
  assert.equal(pm.walletBalanceCents, 4200);
  assert.equal(pm.billingProfile.city, 'Roma');
  assert.equal(pm.leadPurchases[0].leadTitle, 'Appartamento Test');
  assert.equal(pm.stats.totalSpentCents, 5000);
  assert.equal(pm.emailConfirmedAt, '2026-11-01T12:00:00Z');
  assert.equal(pm.signupData.managedPropertiesRange, 'one_to_three');
  assert.deepEqual(h.authCalls, [`auth-${latestId}`]);
  assert.deepEqual(h.queries[0].filters, [['role', 'property_manager'], ['profile_id', latestId]]);
});

test('older PM detail still works', async () => {
  const h = await harness();
  const response = await h.get(`profileId=${id(1)}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).propertyManagers[0].profileId, id(1));
});

test('unknown roles or missing profiles return 404 without exposing other users', async () => {
  for (const missingId of [id(9000), id(1093)]) {
    const h = await harness();
    assert.equal((await h.get(`profileId=${missingId}`)).status, 404);
    assert.equal(h.authCalls.length, 0);
  }
});

test('invalid IDs and unauthenticated or unauthorized requests perform no database reads', async () => {
  const h = await harness();
  assert.equal((await h.get('profileId=invalid')).status, 400);
  assert.equal((await h.get(undefined, null)).status, 401);
  assert.equal(h.queries.length, 0);
  const forbidden = await harness({ deniedStatus: 403 });
  assert.equal((await forbidden.get()).status, 403);
  assert.equal(forbidden.queries.length, 0);
});

test('database errors are not reported as missing PMs', async () => {
  for (const table of ['user_roles', 'profiles', 'billing_profiles']) {
    const h = await harness();
    h.state.databaseError = table;
    assert.equal((await h.get()).status, 500);
  }
});

test('missing or temporarily unavailable Auth metadata does not hide a valid PM', async () => {
  for (const flag of ['missingAuth', 'authError']) {
    const h = await harness();
    h.state[flag] = true;
    const response = await h.get();
    assert.equal(response.status, 200);
    const pm = (await response.json()).propertyManagers[0];
    assert.equal(pm.profileId, latestId);
    assert.equal(pm.emailConfirmedAt, null);
    assert.equal(pm.billingProfile.city, 'Roma');
  }
});

test('paginated list remains on its existing fast path without loading detail archives', async () => {
  const h = await harness();
  const response = await h.get('page=2&search=Roma');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), h.page);
  assert.equal(h.queries.length, 0);
  assert.equal(h.authCalls.length, 0);
});

test('optional live read-only check of latest and oldest PM details, without financial or email operations', {
  skip: process.env.PM_DETAIL_LIVE_READ_ONLY !== '1',
}, async () => {
  const { default: nextEnv } = await import('@next/env');
  const { createClient } = await import('@supabase/supabase-js');
  nextEnv.loadEnvConfig(root);
  const database = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const first = await database.rpc('admin_pm_list_page_v1', { p_search: '', p_managed_properties: null, p_page: 1, p_page_size: 25 });
  assert.equal(first.error, null);
  const last = await database.rpc('admin_pm_list_page_v1', {
    p_search: '', p_managed_properties: null, p_page: Math.ceil(first.data.total / 25), p_page_size: 25,
  });
  assert.equal(last.error, null);
  const h = await harness({ database });
  const profiles = [first.data.propertyManagers[0], last.data.propertyManagers.at(-1)];
  for (const pm of profiles) {
    const response = await h.get(`profileId=${pm.profileId}`);
    assert.equal(response.status, 200);
    const result = (await response.json()).propertyManagers;
    assert.equal(result.length, 1);
    assert.equal(result[0].profileId, pm.profileId);
    assert.ok(Array.isArray(result[0].walletTransactions));
    assert.ok(Array.isArray(result[0].leadPurchases));
  }
  console.log(JSON.stringify({ liveReadOnlyDetailChecks: profiles.length, pmTotal: first.data.total, writes: 0 }));
});
