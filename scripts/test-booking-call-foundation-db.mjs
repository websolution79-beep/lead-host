// Isolated PostgreSQL only. This script never loads application credentials.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = await PGlite.create();
const id = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const migration = await readFile(new URL("../supabase/migrations/202611020001_marketplace_booking_call_foundation.sql", import.meta.url), "utf8");
let checks = 0;
async function checkError(sql, code) {
  await assert.rejects(db.query(sql), error => error.code === code);
  checks++;
}
async function readConfig() {
  return (await db.query("select public.get_marketplace_booking_call_readiness_v1() as config")).rows[0].config;
}
async function setting(key, value) {
  await db.query("update public.settings set value = $2::jsonb where key = $1", [key, JSON.stringify(value)]);
}

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.settings(key text primary key, value jsonb not null);
    insert into public.settings values ('legacy.fixture','{"untouched":true}');
    create function public.purchase_lead_with_wallet() returns text language sql as $$select 'legacy purchase unchanged'::text$$;
    create function public.refund_lead_fixture() returns text language sql as $$select 'legacy refund unchanged'::text$$;
  `);
  for (const table of ["profiles", "team_members", "team_compensation_events", "team_lead_verification_claims", "owner_requests", "property_manager_profiles", "leads", "lead_purchases", "refunds"]) {
    await db.exec(`create table public.${table}(id uuid primary key); insert into public.${table} values ('${id}')`);
  }
  const originalFunctions = (await db.query("select oid,prosrc from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
  await db.exec(migration);
  assert.deepEqual(await readConfig(), { schemaVersion: 1, enabled: false, feeCents: 0, compensationCents: 300, currency: "EUR" }); checks++;
  for (const role of ["anon", "authenticated", "service_role"]) {
    const allowed = role === "service_role";
    assert.equal((await db.query("select has_function_privilege($1,'public.get_marketplace_booking_call_readiness_v1()','EXECUTE') ok", [role])).rows[0].ok, allowed); checks++;
    for (const table of ["marketplace_booking_calls", "marketplace_booking_call_email_outbox"]) {
      assert.equal((await db.query("select has_table_privilege($1,$2,'SELECT') ok", [role, `public.${table}`])).rows[0].ok, allowed); checks++;
      for (const permission of ["INSERT", "UPDATE", "DELETE"]) {
        assert.equal((await db.query("select has_table_privilege($1,$2,$3) ok", [role, `public.${table}`, permission])).rows[0].ok, false); checks++;
      }
      assert.equal((await db.query("select relrowsecurity from pg_class where oid=$1::regclass", [`public.${table}`])).rows[0].relrowsecurity, true); checks++;
    }
  }
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try { await checkError("select public.get_marketplace_booking_call_readiness_v1()", "42501"); await checkError("select * from public.marketplace_booking_calls", "42501"); }
    finally { await db.exec("reset role"); }
  }
  await setting("lead.booking_call_enabled", true);
  for (const value of [-1, 0.5, 2147483648, "1500", null, false, [], {}, "1e10000"]) {
    await setting("lead.booking_call_fee_cents", value);
    assert.equal((await readConfig()).enabled, false); assert.equal((await readConfig()).feeCents, 0); checks++;
  }
  await setting("lead.booking_call_fee_cents", 1500);
  assert.equal((await readConfig()).enabled, true); checks++;
  await setting("lead.booking_call_enabled", "true"); assert.equal((await readConfig()).enabled, false); checks++;
  await setting("lead.booking_call_enabled", true);

  const columns = "lead_purchase_id,lead_id,owner_request_id,property_manager_id,lead_amount_cents,booking_fee_cents,total_amount_cents";
  const refs = `'${id}','${id}','${id}','${id}'`;
  const valid = (await db.query(`insert into public.marketplace_booking_calls(${columns}) values (${refs},5000,1500,6500) returning *`)).rows[0];
  assert.equal(valid.compensation_cents, 300); assert.equal(valid.status, "to_schedule"); assert.equal(valid.qualifying_member_id, null); checks++;
  await checkError(`insert into public.marketplace_booking_calls(${columns}) values (${refs},5000,1500,6500)`, "23505");
  await db.query("insert into public.lead_purchases(id) values ($1)", [secondId]);
  const nextRefs = `'${secondId}','${id}','${id}','${id}'`;
  for (const extra of [
    { amounts: "5000,-1,4999" }, { amounts: "5000,1500,6000" }, { amounts: "0,1500,1500" },
    { columns: ",compensation_cents", values: ",500" }, { columns: ",visibility_mode", values: ",'prime_private'" },
    { columns: ",status", values: ",'unknown'" }, { columns: ",status", values: ",'scheduled'" },
    { columns: ",status", values: ",'refunded'" }, { columns: ",reversal_event_id", values: `,'${id}'` },
  ]) await checkError(`insert into public.marketplace_booking_calls(${columns}${extra.columns ?? ""}) values (${nextRefs},${extra.amounts ?? "5000,1500,6500"}${extra.values ?? ""})`, "23514");

  await db.query("insert into public.marketplace_booking_call_email_outbox(booking_call_id) values ($1)", [valid.id]);
  await checkError(`insert into public.marketplace_booking_call_email_outbox(booking_call_id) values ('${valid.id}')`, "23505");
  await checkError("update public.marketplace_booking_call_email_outbox set status='processing'", "23514");
  await db.exec("update public.marketplace_booking_call_email_outbox set status='processing',lease_id=gen_random_uuid(),locked_at=now(),attempts=attempts+1");
  await checkError("update public.marketplace_booking_call_email_outbox set status='sent'", "23514");
  await db.exec("update public.marketplace_booking_call_email_outbox set status='sent',lease_id=null,locked_at=null,completed_at=now()");
  assert.equal((await db.query("select status from public.marketplace_booking_call_email_outbox")).rows[0].status, "sent"); checks++;

  await db.exec(migration);
  assert.equal((await readConfig()).feeCents, 1500); assert.equal((await readConfig()).enabled, true); checks++;
  assert.equal((await db.query("select count(*)::int n from public.marketplace_booking_calls")).rows[0].n, 1); checks++;
  assert.deepEqual((await db.query("select value from public.settings where key='legacy.fixture'")).rows[0].value, { untouched: true }); checks++;
  for (const original of originalFunctions) {
    assert.equal((await db.query("select prosrc from pg_proc where oid=$1", [original.oid])).rows[0].prosrc, original.prosrc); checks++;
  }
  assert.equal((await db.query("select count(*)::int n from pg_trigger where not tgisinternal and tgrelid in ('public.marketplace_booking_calls'::regclass,'public.marketplace_booking_call_email_outbox'::regclass)")).rows[0].n, 0); checks++;
  console.log(JSON.stringify({ passed: true, checks, isolatedPostgres: true, appliedTwice: true, productionReads: 0, productionWrites: 0, legacyFunctionsUnchanged: true, defaultFeatureDisabled: true }));
} finally {
  await db.close();
}
