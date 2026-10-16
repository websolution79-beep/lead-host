// Actual GET route with isolated database/auth mocks. No network or email delivery.
// Run: node --experimental-vm-modules --test scripts/test-service-emails-api.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
import { z } from 'zod';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function harness({ size = 687, failTable = null, failBatch = null, campaignError = null } = {}) {
  const queries = [];
  const propertyManagers = Array.from({ length: size }, (_, index) => ({
    profile_id: `pm-${String(index).padStart(5, '0')}`, verification_status: 'verified',
  }));
  const profiles = propertyManagers.map(row => ({ id: row.profile_id, status: 'active' }));
  const campaigns = [{ id: 'old-campaign', status: 'completed', sent_count: 573 }];
  const client = {
    from(table) {
      const q = { table, filters: [], range: null, ids: null };
      queries.push(q);
      const builder = {
        select() { return this; },
        neq(key, value) { q.filters.push([key, 'neq', value]); return this; },
        eq(key, value) { q.filters.push([key, 'eq', value]); return this; },
        in(key, values) { q.ids = { key, values: [...values] }; return this; },
        order() { return this; },
        range(from, to) { q.range = [from, to]; return this; },
        limit() { return this; },
        then(onFulfilled, onRejected) {
          if (q.ids) assert.ok(q.ids.values.length <= 100, 'oversized profile lookup');
          let error = table === failTable ? { message: 'Private database failure' } : null;
          if (table === 'profiles' && failBatch === queries.filter(q => q.table === 'profiles').length) error = { message: 'Batch failed' };
          if (table === 'service_email_campaigns' && campaignError) error = campaignError;
          let rows = { property_manager_profiles: propertyManagers, profiles, service_email_campaigns: campaigns }[table];
          assert.ok(rows, `Unexpected table ${table}`);
          rows = rows.filter(row => q.filters.every(([key, op, value]) => op === 'eq' ? row[key] === value : row[key] !== value));
          if (q.ids) rows = rows.filter(row => q.ids.values.includes(row[q.ids.key]));
          if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
          else rows = rows.slice(0, 1000);
          return Promise.resolve({ data: error ? null : rows, error }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
  const context = createContext({});
  const modules = new Map();
  async function load(relative) {
    const path = resolve(root, relative);
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(await readFile(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const compiled = new SourceTextModule(code, { context, identifier: path });
    modules.set(path, compiled);
    await compiled.link(async specifier => {
      if (specifier === '@/lib/email/service-recipients') return load('src/lib/email/service-recipients.ts');
      if (specifier === '@/lib/supabase/batched-query') return load('src/lib/supabase/batched-query.ts');
      const neverSend = () => { throw new Error('GET must not send, queue, process or audit'); };
      const exports = {
        'next/server': { NextResponse, after: neverSend },
        zod: { z },
        '@/lib/admin/auth': {
          requireSuperAdmin: async request => {
            const token = request.headers.get('authorization');
            if (token !== 'Bearer admin') throw { status: token ? 403 : 401 };
            return { supabase: client };
          },
          adminApiErrorResponse: error => NextResponse.json({ error: 'Errore interno nella gestione admin.' }, { status: error.status ?? 500 }),
        },
        '@/lib/admin/audit': { writeAdminAuditLog: neverSend },
        '@/lib/email/service-campaigns': {
          processServiceEmailQueue: neverSend, runServiceEmailWorkerSafely: neverSend, sendServiceEmailTest: neverSend,
        },
      }[specifier];
      assert.ok(exports, `Unexpected dependency ${specifier}`);
      const dependency = new SyntheticModule(Object.keys(exports), function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      }, { context });
      await dependency.link(() => { throw new Error('Unexpected nested import'); });
      return dependency;
    });
    return compiled;
  }
  const route = await load('src/app/api/admin/service-emails/route.ts');
  await route.evaluate();
  return {
    queries, profiles, propertyManagers,
    get: token => route.namespace.GET(new NextRequest('https://example.test/api/admin/service-emails', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })),
  };
}

for (const size of [0, 100, 687, 1000, 1207]) {
  test(`GET counts ${size} recipients without oversized URLs or row truncation`, async () => {
    const h = await harness({ size });
    const response = await h.get('admin');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = await response.json();
    assert.equal(body.eligibleRecipients, size);
    assert.equal(body.storageReady, true);
    assert.equal(body.campaigns[0].id, 'old-campaign');
    assert.equal(h.queries.filter(q => q.table === 'profiles').length, Math.ceil(size / 100));
    assert.ok(h.queries.filter(q => q.table === 'property_manager_profiles').every(q => q.range[1] - q.range[0] === 499));
  });
}

test('GET preserves suspension filters and deduplicates PM profile IDs', async () => {
  const h = await harness({ size: 687 });
  h.propertyManagers[0].verification_status = 'suspended';
  h.profiles[1].status = 'suspended';
  h.propertyManagers.push({ ...h.propertyManagers[2] });
  const response = await h.get('admin');
  assert.equal((await response.json()).eligibleRecipients, 685);
});

test('missing campaigns table keeps the existing migration-required response', async () => {
  const h = await harness({ campaignError: { code: '42P01', message: 'relation does not exist' } });
  const body = await (await h.get('admin')).json();
  assert.equal(body.storageReady, false);
  assert.deepEqual(body.campaigns, []);
});

for (const failure of [{ failTable: 'property_manager_profiles' }, { failBatch: 2 }, { failTable: 'service_email_campaigns' }]) {
  test(`GET fails closed without a partial recipient count: ${JSON.stringify(failure)}`, async () => {
    const h = await harness(failure);
    const response = await h.get('admin');
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.eligibleRecipients, undefined);
    assert.equal(JSON.stringify(body).includes('Private database'), false);
  });
}

for (const [token, status] of [[null, 401], ['pm', 403]]) {
  test(`GET rejects ${token ?? 'anonymous'} before database access`, async () => {
    const h = await harness();
    assert.equal((await h.get(token)).status, status);
    assert.equal(h.queries.length, 0);
  });
}
