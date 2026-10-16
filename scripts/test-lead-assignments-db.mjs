// Isolated PostgreSQL engine only. Never executes against Supabase.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const { PGlite } = await import(pathToFileURL(resolve(root, 'tmp/systeme-db-validation/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
const admin = '10000000-0000-4000-8000-000000000001';
const a = '10000000-0000-4000-8000-000000000002';
const b = '10000000-0000-4000-8000-000000000003';
const readOnly = '10000000-0000-4000-8000-000000000004';
const suspended = '10000000-0000-4000-8000-000000000005';
const lead = '20000000-0000-4000-8000-000000000001';
const published = '20000000-0000-4000-8000-000000000002';
const rollbackLead = '20000000-0000-4000-8000-000000000003';

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key, status text, first_name text, last_name text);
    create table user_roles(profile_id uuid, role text);
    create table team_roles(id uuid primary key, is_active boolean);
    create table team_role_permissions(role_id uuid, permission_key text, access_level text);
    create table team_members(profile_id uuid, role_id uuid, status text, must_change_password boolean, badge_color text);
    create table owner_requests(id uuid primary key, status text, first_worked_by_profile_id uuid, qualification_notes text);
    create table audit_logs(actor_profile_id uuid, actor_role text, entity_type text, entity_id uuid, action text, "before" jsonb, "after" jsonb);
    create table compensation_sentinel(id int);
    insert into compensation_sentinel values(1);
    insert into profiles values
      ('${admin}', 'active', 'Admin', 'Test'), ('${a}', 'active', 'Noemi', 'Test'),
      ('${b}', 'active', 'Giorgia', 'Test'), ('${readOnly}', 'active', 'Read', 'Only'),
      ('${suspended}', 'suspended', 'Suspended', 'Member');
    insert into user_roles values ('${admin}','super_admin'), ('${a}','team_member'),
      ('${b}','team_member'), ('${readOnly}','team_member'), ('${suspended}','team_member');
    insert into team_roles values ('${a}',true), ('${readOnly}',true);
    insert into team_role_permissions values ('${a}','leads','write'), ('${readOnly}','leads','read');
    insert into team_members values ('${a}','${a}','active',false,'#00FF00'),
      ('${b}','${a}','active',false,'#FF00FF'), ('${readOnly}','${readOnly}','active',false,'#2563EB'),
      ('${suspended}','${a}','active',false,'#2563EB');
    insert into owner_requests values ('${lead}','to_verify','${b}','Richiamare alle 9:30'),
      ('${published}','published','${b}','Non cambiare'), ('${rollbackLead}','to_verify',null,null);
  `);
  const migration = await readFile(resolve(root, 'supabase/migrations/202610160001_owner_request_assignments.sql'), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  const original = (await db.query('select * from owner_requests order by id')).rows;
  const run = async (actor, target, revision = '0', owner = lead) => (await db.query(
    'select set_owner_request_assignment($1,$2,$3,$4)::jsonb as result', [owner, actor, target, revision],
  )).rows[0].result.status;
  const candidates = async actor => (await db.query('select * from owner_request_assignment_candidates($1)', [actor])).rows;
  assert.deepEqual((await candidates(a)).map(row => row.profile_id), [a]);
  assert.deepEqual((await candidates(readOnly)), []);
  assert.equal((await candidates(admin)).length, 3);
  assert.equal(await run(readOnly, readOnly), 'forbidden');
  assert.equal(await run(suspended, suspended), 'forbidden');
  assert.equal(await run(a, b), 'forbidden');
  assert.equal(await run(admin, readOnly), 'invalid_assignee');
  assert.equal(await run(a, a, '0', published), 'unavailable');
  assert.equal(await run(a, a, '0', '20000000-0000-4000-8000-000000000099'), 'not_found');
  assert.equal(await run(a, a), 'saved');
  assert.equal(await run(b, b), 'conflict');
  assert.equal(await run(b, b, '1'), 'occupied');
  assert.equal(await run(b, null, '1'), 'occupied');
  assert.equal(await run(a, a, '1'), 'unchanged');
  assert.equal(await run(a, null, '1'), 'saved');
  assert.equal(await run(b, b, '0'), 'conflict'); // Claim/release does not reset the version.
  assert.equal(await run(b, b, '2'), 'saved');
  assert.equal(await run(admin, a, '3'), 'saved');
  assert.equal(await run(admin, null, '4'), 'saved');
  assert.equal(await run(a, a, null), 'conflict');
  const audits = (await db.query('select action from audit_logs')).rows.map(row => row.action);
  assert.deepEqual(audits, ['lead.assignment.claimed', 'lead.assignment.released', 'lead.assignment.claimed', 'lead.assignment.reassigned', 'lead.assignment.released']);
  assert.equal((await db.query('select revision::text from owner_request_assignments where owner_request_id=$1', [lead])).rows[0].revision, '5');
  assert.deepEqual((await db.query('select * from owner_requests order by id')).rows, original);
  assert.equal((await db.query('select count(*)::int as n from compensation_sentinel')).rows[0].n, 1);

  await db.exec(`alter table audit_logs add constraint fail_audit check(action <> 'lead.assignment.claimed') not valid`);
  await assert.rejects(run(a, a, '0', rollbackLead), /fail_audit/);
  assert.equal((await db.query('select count(*)::int as n from owner_request_assignments where owner_request_id=$1', [rollbackLead])).rows[0].n, 0);
  await db.exec('alter table audit_logs drop constraint fail_audit');
  await db.exec(`update team_roles set is_active=false where id='${a}'`);
  assert.equal(await run(a, a, '5'), 'forbidden');
  await db.exec(`update team_roles set is_active=true where id='${a}'; update team_members set must_change_password=true where profile_id='${a}'`);
  assert.equal(await run(a, a, '5'), 'forbidden');

  const protection = (await db.query(`select
    (select relrowsecurity from pg_class where oid='owner_request_assignments'::regclass) as rls,
    has_table_privilege('anon','owner_request_assignments','select') as anon_read,
    has_table_privilege('authenticated','owner_request_assignments','update') as browser_write,
    has_function_privilege('authenticated','set_owner_request_assignment(uuid,uuid,uuid,bigint)','execute') as browser_rpc,
    has_function_privilege('service_role','set_owner_request_assignment(uuid,uuid,uuid,bigint)','execute') as service_rpc`)).rows[0];
  assert.deepEqual(protection, { rls: true, anon_read: false, browser_write: false, browser_rpc: false, service_rpc: true });
  console.log('PASS: rerunnable additive schema; own-only candidates/claims; role, profile and password guards; occupied/stale claims; ABA protection; admin reassignment; atomic audit rollback; unchanged first work/notes/compensation; RLS/service-only RPC.');
} finally { await db.close(); }
