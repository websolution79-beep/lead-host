// Isolated actual API handlers; no network, real identities or database writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
import { z } from 'zod';

const root = resolve(import.meta.dirname, '..');
const a = '10000000-0000-4000-8000-000000000001';
const b = '10000000-0000-4000-8000-000000000002';
const lead = '20000000-0000-4000-8000-000000000001';

async function harness() {
  const queries = [], calls = [];
  const state = { outcome: 'saved', error: null, rows: 1 };
  const client = {
    from(table) {
      const query = { table, filters: [], ids: [], range: null };
      queries.push(query);
      const builder = {
        select() { return this; },
        eq(key, value) { query.filters.push([key, value]); return this; },
        in(key, values) { assert.ok(values.length <= 100); query.ids = values; return this; },
        order() { return this; },
        range(from, to) { query.range = [from, to]; return this; },
        then(ok, fail) {
          let data;
          if (table === 'owner_request_assignments') data = Array.from({ length: state.rows }, (_, index) => ({
            owner_request_id: index ? `lead-${index}` : lead, assignee_profile_id: b, revision: 4, assigned_at: '2026-10-16T10:00:00Z',
          })).slice(query.range[0], query.range[1] + 1);
          else if (table === 'profiles') data = [{ id: b, first_name: 'Giorgia', last_name: 'Test' }];
          else if (table === 'team_members') data = [{ profile_id: b, badge_color: '#FF00FF' }];
          else throw new Error(`Unexpected table ${table}`);
          return Promise.resolve({ data: state.error ? null : data, error: state.error }).then(ok, fail);
        },
      };
      return builder;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'owner_request_assignment_candidates') return {
        data: [{ profile_id: args.p_actor_profile_id, first_name: 'Noemi', last_name: 'Test', badge_color: '#00FF00' }], error: null,
      };
      assert.equal(name, 'set_owner_request_assignment');
      return { data: { status: state.outcome }, error: state.error };
    },
  };
  const context = createContext({});
  const modules = new Map();
  async function load(relative) {
    const path = resolve(root, relative);
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(await readFile(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const compiled = new SourceTextModule(code, { context, identifier: path });
    modules.set(path, compiled);
    await compiled.link(async name => {
      if (name === '@/lib/supabase/batched-query') return load('src/lib/supabase/batched-query.ts');
      const exports = {
        'next/server': { NextResponse }, zod: { z },
        '@/lib/admin/auth': {
          requireAdminPermission: async (request, permission, access) => {
            assert.equal(permission, 'leads');
            const token = request.headers.get('authorization');
            if (!token) throw { status: 401 };
            if (token === 'Bearer pm' || (token === 'Bearer read' && access === 'write')) throw { status: 403 };
            return { supabase: client, profile: { id: a }, isSuperAdmin: token === 'Bearer admin' };
          },
          adminApiErrorResponse: error => NextResponse.json({ error: 'Errore interno nella gestione admin.' }, { status: error.status ?? 500 }),
        },
      }[name];
      assert.ok(exports, `Unexpected import ${name}`);
      const dependency = new SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
      await dependency.link(() => { throw new Error('Unexpected nested import'); });
      return dependency;
    });
    return compiled;
  }
  const route = await load('src/app/api/admin/leads/assignments/route.ts');
  await route.evaluate();
  const request = (token, body) => new NextRequest('https://example.test/api/admin/leads/assignments?actorProfileId=spoofed', {
    method: body ? 'PATCH' : 'GET', headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { state, queries, calls, get: token => route.namespace.GET(request(token)), patch: (token, body) => route.namespace.PATCH(request(token, body)) };
}

const command = { ownerRequestId: lead, assigneeProfileId: a, expectedRevision: '4' };
test('snapshot exposes current owner to colleagues but only the actor as a candidate', async () => {
  const h = await harness();
  const response = await h.get('member');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const data = await response.json();
  assert.equal(data.actorProfileId, a);
  assert.equal(data.canManageAll, false);
  assert.equal(data.candidates[0].profileId, a);
  assert.equal(data.assignments[0].assignee.profileId, b);
  assert.equal(data.assignments[0].assignee.badgeColor, '#FF00FF');
  assert.equal(data.assignments[0].revision, '4');
  assert.deepEqual(h.queries[0].filters, [['owner_requests.status', 'to_verify']]);
});
test('assignment snapshots page beyond the PostgREST row cap', async () => {
  const h = await harness(); h.state.rows = 1207;
  const data = await (await h.get('admin')).json();
  assert.equal(data.assignments.length, 1207);
  assert.equal(data.canManageAll, true);
  assert.equal(h.queries.filter(q => q.table === 'owner_request_assignments').length, 3);
});
test('missing migration disables only assignment, not the existing pipeline', async () => {
  const h = await harness(); h.state.error = { code: 'PGRST205' };
  const response = await h.get('member');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).storageReady, false);
  assert.equal((await h.patch('member', command)).status, 503);
});
test('server binds the RPC actor to the session and rejects client ownership fields', async () => {
  const h = await harness();
  assert.equal((await h.patch('member', { ...command, actorProfileId: b })).status, 422);
  assert.equal(h.calls.length, 0);
  assert.equal((await h.patch('member', command)).status, 200);
  assert.equal(h.calls[0].args.p_actor_profile_id, a);
  assert.equal(h.calls[0].args.p_expected_revision, '4');
});
for (const [outcome, status] of [['conflict',409],['occupied',409],['invalid_assignee',409],['unavailable',409],['not_found',404],['forbidden',403],['unchanged',200]]) {
  test(`RPC ${outcome} maps to ${status} without retrying or sending emails`, async () => {
    const h = await harness(); h.state.outcome = outcome;
    assert.equal((await h.patch('member', command)).status, status);
    assert.equal(h.calls.length, 1);
  });
}
test('invalid revisions and identities are rejected before the RPC', async () => {
  const h = await harness();
  for (const revision of ['-1', '1.5', '', '99999999999999999999999']) assert.equal((await h.patch('member', { ...command, expectedRevision: revision })).status, 422);
  assert.equal((await h.get(null)).status, 401);
  assert.equal((await h.get('pm')).status, 403);
  assert.equal((await h.patch('read', command)).status, 403);
  assert.equal(h.calls.length, 0);
  assert.equal(h.queries.length, 0);
});
