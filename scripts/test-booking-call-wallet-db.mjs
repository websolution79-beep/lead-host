// In-memory PostgreSQL only: no application credentials, no live calls or emails.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { testBookingWorkflow } from "./test-booking-call-workflow-fixture.mjs";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = await PGlite.create();
const uuid = (kind, n = 1) => `${String(kind).padStart(8,"0")}-0000-4000-8000-${String(n).padStart(12,"0")}`;
const buyer = uuid(1), otherBuyer = uuid(1,2), admin = uuid(1,3), qualifierProfile = uuid(1,4), promoterProfile = uuid(1,5);
const pm = uuid(2), otherPm = uuid(2,2), qualifier = uuid(3), promoter = uuid(3,2);
const lead = n => uuid(4,n), request = n => uuid(5,n), token = n => uuid(6,n);
const sql = name => readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),"utf8");
const prefix = (source, marker) => { const index = source.indexOf(marker); assert.ok(index > 0,`Missing fixture boundary ${marker}`); return source.slice(0,index); };
let checks = 0;
const one = async (query,params=[]) => (await db.query(query,params)).rows[0];
const count = async table => Number((await one(`select count(*)::int n from public.${table}`)).n);
const booking = async n => one("select * from public.marketplace_booking_calls where id=$1",[token(n)]);
const balance = async (profile=buyer) => (await one("select balance_cents from wallets where profile_id=$1",[profile])).balance_cents;
const buy = async (n, options={}) => (await one("select public.purchase_exclusive_lead_with_booking_call($1,$2,$3,$4,$5,$6,$7) r",[
  options.profile ?? buyer,options.pm ?? pm,lead(n),options.leadAmount ?? 5000,options.fee ?? 1500,options.terms ?? "fixture-terms",options.token ?? token(n),
])).r;
async function expectError(run, message) {
  await assert.rejects(run,error => { assert.ok(error.message.includes(message),error.message); return true; }); checks++;
}
async function replenish(profile=buyer,amount=100000) { await db.query("update wallets set balance_cents=$2 where profile_id=$1",[profile,amount]); }
async function makeLead(n,{claim=true,member=qualifier,visibility="public",expired=false}={}) {
  await db.query("insert into owner_requests(id,acquisition_channel,status) values($1,'manual','published')",[request(n)]);
  await db.query("insert into properties(id,owner_request_id,city) values($1,$2,'Milano')",[uuid(7,n),request(n)]);
  await db.query("insert into leads(id,owner_request_id,property_id,title,visibility_mode,published_at,expires_at,prime_access_until) values($1,$2,$3,$4,$5,now()-interval '1 day',now()+$6::interval,now()+interval '1 day')",[lead(n),request(n),uuid(7,n),`Fixture immobile ${n}`,visibility,expired?'-1 day':'7 days']);
  if(claim){
    const event=await one("insert into team_compensation_events(member_id,event_type,status,source_type,source_id,source_event_key,owner_request_id,amount_cents,description,occurred_at) values($1,'lead_verification','accrued','owner_request',$2,$3,$4,300,'Qualifica fixture',now()-interval '1 hour') returning id",[member,request(n),`qualification:${n}`,request(n)]);
    const memberProfile=(await one("select profile_id from team_members where id=$1",[member])).profile_id;
    await db.query("insert into team_lead_verification_claims(owner_request_id,member_id,compensation_event_id,confirmed_by) values($1,$2,$3,$4)",[request(n),member,event.id,memberProfile]);
  }
}
async function refund(n){
  const b=await booking(n);const row=await one("insert into refunds(lead_purchase_id,requested_by_property_manager_id,amount_cents,status,reason) values($1,$2,1,'approved','Fixture refund') returning id",[b.lead_purchase_id,b.property_manager_id]);
  const result=await one("select * from public.pay_wallet_refund($1,$2)",[row.id,admin]);return {refund:row.id,result};
}
try {
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;");
  // pgcrypto is unavailable in PGlite; core gen_random_uuid() is provided by PostgreSQL.
  await db.exec((await sql("202607200001_lead_host_foundation")).replace("create extension if not exists pgcrypto;",""));
  await db.exec(prefix(await sql("202607200002_auth_roles_wallet"),"create or replace function current_profile_id"));
  await db.exec("create function current_profile_id() returns uuid language sql as $$select null::uuid$$;create function is_super_admin() returns boolean language sql as $$select false$$;");
  await db.exec(await sql("202607200006_commercial_settings"));
  await db.exec(prefix(await sql("202607220002_atomic_wallet_purchase"),"create or replace function purchase_lead_with_wallet"));
  await db.exec(prefix(await sql("202607240001_commercial_safety_hardening"),'drop policy if exists "pm_profiles_upsert_own_or_admin"'));
  await db.exec(prefix(await sql("202608110001_marketplace_price_promotions"),"create or replace function public.purchase_lead_with_wallet"));
  await db.exec(`alter table leads add column visibility_mode text not null default 'public',add column prime_access_until timestamptz;
    create function public.profile_can_access_prime_lead(uuid,uuid,timestamptz) returns boolean language sql as $$select false$$;
    create table prime_lead_events(id uuid primary key default gen_random_uuid(),lead_id uuid,target_property_manager_id uuid,actor_profile_id uuid,event_type text,from_visibility_mode text,to_visibility_mode text,access_until timestamptz,metadata jsonb);
    create table prime_accounts(id uuid primary key default gen_random_uuid(),profile_id uuid,status text,prime_expires_at timestamptz,grace_ends_at timestamptz);
    create table addon_products(id uuid primary key,slug text);
    create table addon_subscriptions(id uuid primary key,profile_id uuid,addon_product_id uuid,status text,current_period_ends_at timestamptz,trial_ends_at timestamptz);
    create table team_roles(id uuid primary key,name text);
    create table team_members(id uuid primary key,profile_id uuid references profiles(id),role_id uuid references team_roles(id),status text);
    create function public.can_take_owner_request(uuid) returns boolean language sql as $$select true$$;
  `);
  await db.exec(await sql("202608160007_prime_zone_purchase"));
  await db.exec(await sql("202608170002_team_compensation_foundation"));
  await db.exec(await sql("202608170007_team_compensation_payouts"));
  await db.exec(await sql("202609170001_marketplace_purchase_access"));
  await db.exec(await sql("202610210001_marketplace_lead_promotion_foundation"));
  await db.exec(await sql("202610210002_marketplace_promotion_compensations"));
  await db.exec(await sql("202611020001_marketplace_booking_call_foundation"));
  const originalFunctions=(await db.query("select oid,pg_get_functiondef(oid) body from pg_proc where pronamespace='public'::regnamespace")).rows;
  await db.exec(await sql("202611020002_marketplace_booking_call_wallet"));
  await db.exec(await sql("202611020002_marketplace_booking_call_wallet"));
  for(const f of originalFunctions){assert.equal((await one("select pg_get_functiondef($1) body",[f.oid])).body,f.body);checks++;}
  assert.equal((await one("select public.get_marketplace_booking_call_readiness_v2() r")).r.engineReady,true);checks++;
  assert.equal((await one("select public.get_marketplace_booking_call_readiness_v2() r")).r.enabled,false);checks++;
  for(const role of ["anon","authenticated"]){
    await db.exec(`set role ${role}`);
    try {
      await expectError(buy(1),"permission denied");
      await expectError(db.query("select get_marketplace_booking_call_readiness_v2()"),"permission denied");
      await expectError(db.query("select attribute_booking_call_compensation($1,$2,$3)",[token(7),qualifier,admin]),"permission denied");
    } finally {await db.exec("reset role");}
  }
  for(const [id,name] of [[buyer,"Buyer"],[otherBuyer,"OtherBuyer"],[admin,"Admin"],[qualifierProfile,"Qualifier"],[promoterProfile,"Promoter"]]){
    await db.query("insert into profiles(id,email,first_name,status) values($1,$2,$3,'active')",[id,`${name.toLowerCase()}@example.invalid`,name]);
  }
  await db.query("insert into user_roles(profile_id,role) values($1,'property_manager'),($2,'property_manager'),($3,'super_admin')",[buyer,otherBuyer,admin]);
  await db.query("insert into property_manager_profiles(id,profile_id,company_name) values($1,$2,'Fixture PM'),($3,$4,'Other Fixture PM')",[pm,buyer,otherPm,otherBuyer]);
  await db.query("insert into wallets(profile_id,balance_cents) values($1,100000),($2,100000)",[buyer,otherBuyer]);
  await db.query("insert into team_roles(id,name) values($1,'Moderatore')",[uuid(8)]);
  await db.query("insert into team_members(id,profile_id,role_id,status) values($1,$2,$5,'active'),($3,$4,$5,'active')",[qualifier,qualifierProfile,promoter,promoterProfile,uuid(8)]);
  await db.exec("update team_compensation_settings set feature_enabled=true;");
  for(let n=1;n<=22;n++)await makeLead(n,{claim:![7,8].includes(n),visibility:n===4?'prime_private':'public',expired:n===5});

  await expectError(buy(1),"booking_call_disabled");assert.equal(await balance(),100000);checks++;
  await db.exec("update settings set value='true'::jsonb where key='lead.booking_call_enabled';update settings set value='1500'::jsonb where key='lead.booking_call_fee_cents';");
  const ownerBefore=await one("select updated_at from owner_requests where id=$1",[request(1)]);
  const first=await buy(1);assert.equal(first.amountCents,6500);assert.equal(first.balanceCents,93500);assert.equal(first.qualifyingMemberId,qualifier);checks+=3;
  const b=await booking(1),event=await one("select * from team_compensation_events where id=$1",[b.compensation_event_id]);
  assert.equal(event.event_type,"marketplace_booking_call");assert.equal(event.amount_cents,300);assert.equal(event.member_id,qualifier);assert.equal(b.status,"to_schedule");checks+=4;
  await expectError(db.query("update team_compensation_events set amount_cents=500 where id=$1",[event.id]),"booking_ledger_immutable");
  await expectError(db.query("update team_compensation_events set member_id=$2 where id=$1",[event.id,promoter]),"booking_attribution_requires_booking_command");
  assert.deepEqual(await one("select updated_at from owner_requests where id=$1",[request(1)]),ownerBefore);checks++;
  const transaction=await one("select * from wallet_transactions where lead_purchase_id=$1",[first.purchaseId]);assert.equal(transaction.amount_cents,-6500);assert.equal(transaction.metadata.lead_amount_cents,5000);assert.equal(transaction.metadata.booking_fee_cents,1500);checks+=3;
  assert.equal((await one("select metadata from terms_acceptances where lead_purchase_id=$1",[first.purchaseId])).metadata.amount_cents,6500);checks++;
  const replay=await buy(1);assert.equal(replay.purchaseId,first.purchaseId);assert.equal(replay.replayed,true);assert.equal(await count("marketplace_booking_calls"),1);assert.equal(await count("marketplace_booking_call_email_outbox"),1);assert.equal(await balance(),93500);checks+=5;
  await expectError(buy(1,{token:token(1001)}),"already_purchased");
  await expectError(buy(2,{token:token(1)}),"booking_request_conflict");
  await expectError(buy(1,{profile:otherBuyer,pm:otherPm,token:token(1002)}),"exclusive_not_available");
  await expectError(buy(2,{profile:otherBuyer,pm}),"property_manager_not_authorized");
  await expectError(buy(2,{terms:" "}),"terms_acceptance_required");
  await expectError(buy(2,{leadAmount:0}),"invalid_booking_purchase");
  await expectError(buy(4),"booking_public_only");await expectError(buy(5),"lead_unavailable");
  await expectError(buy(2,{leadAmount:4500,fee:2000}),"price_changed");
  await db.query("update leads set exclusive_price_cents=2147483647 where id=$1",[lead(16)]);
  await expectError(buy(16,{leadAmount:2147483647}),"booking_total_out_of_range");
  await db.query("update leads set shared_slots_sold=1,internal_status='one_slot_sold' where id=$1",[lead(17)]);
  await expectError(buy(17),"exclusive_not_available");
  await db.query("update leads set published_at=null where id=$1",[lead(18)]);
  await expectError(buy(18),"lead_not_found");
  await db.query("update profiles set status='suspended' where id=$1",[buyer]);await expectError(buy(2),"property_manager_not_authorized");await db.query("update profiles set status='active' where id=$1",[buyer]);
  await replenish(buyer,6000);await expectError(buy(2),"insufficient_credit");assert.equal(await balance(),6000);checks++;
  const normal=await one("select * from purchase_lead_with_wallet($1,$2,$3,'exclusive',5000,'fixture-terms')",[buyer,pm,lead(2)]);assert.equal(normal.amount_cents,5000);assert.equal(await balance(),1000);assert.equal(await booking(2),undefined);checks+=3;
  await replenish();

  // A failure at the last write must roll back purchase, debit, compensation and booking.
  await db.exec("create function fail_booking_queue_fixture() returns trigger language plpgsql as $$begin raise exception 'fixture_queue_failure';end;$$;create trigger fail_booking_queue_fixture before insert on marketplace_booking_call_email_outbox for each row execute function fail_booking_queue_fixture();");
  const beforeCounts=[await count("lead_purchases"),await count("wallet_transactions"),await count("team_compensation_events")];
  await expectError(buy(3),"fixture_queue_failure");assert.equal(await balance(),100000);assert.deepEqual([await count("lead_purchases"),await count("wallet_transactions"),await count("team_compensation_events")],beforeCounts);assert.equal((await one("select internal_status from leads where id=$1",[lead(3)])).internal_status,"available");checks+=3;
  await db.exec("drop trigger fail_booking_queue_fixture on marketplace_booking_call_email_outbox;");
  await buy(3);
  const refundResult=await refund(3);assert.equal(refundResult.result.amount_cents,6500);assert.equal(await balance(),100000);checks+=2;
  const refunded=await booking(3);assert.equal(refunded.status,"refunded");assert.equal((await one("select amount_cents from team_compensation_events where id=$1",[refunded.reversal_event_id])).amount_cents,-300);checks+=2;
  await expectError(db.query("update team_compensation_events set amount_cents=-500 where id=$1",[refunded.reversal_event_id]),"booking_ledger_immutable");
  assert.equal((await one("select amount_cents from team_compensation_events where source_event_key='qualification:3'")).amount_cents,300);assert.equal((await one("select status from marketplace_booking_call_email_outbox where booking_call_id=$1",[token(3)])).status,"skipped");checks+=2;
  const afterRefundCounts=await count("team_compensation_events");await db.query("select * from pay_wallet_refund($1,$2)",[refundResult.refund,admin]);assert.equal(await count("team_compensation_events"),afterRefundCounts);assert.equal(await balance(),100000);checks+=2;
  await expectError(buy(3),"booking_purchase_refunded");
  await db.query("update team_members set status='inactive' where id=$1",[qualifier]);await buy(19);
  assert.equal((await booking(19)).qualifying_member_id,qualifier);assert.equal((await booking(19)).assigned_member_id,null);checks+=2;
  await db.query("update team_members set status='active' where id=$1",[qualifier]);
  await db.query("update team_lead_verification_claims set status='voided',voided_at=now(),void_reason='Fixture voided claim' where owner_request_id=$1",[request(20)]);
  await buy(20);assert.equal((await booking(20)).qualifying_member_id,null);checks++;

  // Old shared purchases and ordinary refunds retain their real implementations.
  const shared=await one("select * from purchase_lead_with_wallet($1,$2,$3,'shared',2900,'fixture-terms')",[buyer,pm,lead(6)]);assert.equal(shared.amount_cents,2900);checks++;
  const oldRefund=await one("insert into refunds(lead_purchase_id,requested_by_property_manager_id,amount_cents,status,reason) values($1,$2,1,'approved','Fixture ordinary refund') returning id",[shared.purchase_id,pm]);
  const oldEventCount=await count("team_compensation_events");const paidOld=await one("select * from pay_wallet_refund($1,$2)",[oldRefund.id,admin]);assert.equal(paidOld.amount_cents,2900);assert.equal(await count("team_compensation_events"),oldEventCount);checks+=2;

  // Historical leads missing a claim: never use the promoter/first worker as a silent fallback.
  await buy(7);let pending=await booking(7);assert.equal(pending.qualifying_member_id,null);assert.equal((await one("select status from team_compensation_events where id=$1",[pending.compensation_event_id])).status,"pending_attribution");checks+=2;
  await refund(7);pending=await booking(7);
  await expectError(db.query("update team_compensation_events set member_id=$2,status='accrued' where id=$1",[pending.compensation_event_id,promoter]),"booking_attribution_requires_booking_command");
  await expectError(db.query("select attribute_booking_call_compensation($1,$2,$3)",[token(7),qualifier,buyer]),"reviewer_not_authorized");
  await db.query("select attribute_booking_call_compensation($1,$2,$3)",[token(7),qualifier,admin]);
  const pair=(await db.query("select member_id,status,amount_cents from team_compensation_events where id in ($1,$2)",[pending.compensation_event_id,pending.reversal_event_id])).rows;
  assert.ok(pair.every(e=>e.member_id===qualifier&&e.status==='accrued'));assert.equal(pair.reduce((s,e)=>s+e.amount_cents,0),0);checks+=2;
  assert.equal((await one("select attribute_booking_call_compensation($1,$2,$3) r",[token(7),qualifier,admin])).r.replayed,true);checks++;
  await expectError(db.query("select attribute_booking_call_compensation($1,$2,$3)",[token(7),promoter,admin]),"booking_compensation_already_attributed");
  await buy(8);await db.query("select attribute_booking_call_compensation($1,$2,$3)",[token(8),promoter,admin]);await refund(8);assert.equal((await one("select member_id from team_compensation_events where id=$1",[(await booking(8)).reversal_event_id])).member_id,promoter);checks++;

  // Real marketplace promotions discount the lead only, never the service fee.
  await db.exec(`insert into marketplace_price_promotions(name,status,apply_exclusive,rules) values('Fixture offer','active',true,'[{"mode":"exclusive","basePriceCents":5000,"promotionalPriceCents":4000}]');`);
  await expectError(buy(9),"price_changed");const discounted=await buy(9,{leadAmount:4000});assert.equal(discounted.amountCents,5500);assert.equal(discounted.bookingFeeCents,1500);checks+=2;
  await db.exec("update marketplace_price_promotions set status='ended';update settings set value='1700'::jsonb where key='lead.booking_call_fee_cents';");
  await expectError(buy(10),"price_changed");await db.exec("update settings set value='1500'::jsonb where key='lead.booking_call_fee_cents';");

  // Membership protection is inherited from the unchanged purchase-table trigger.
  await db.exec(`insert into settings(key,value) values('marketplace.membership','{"paidAccessEnabled":true}') on conflict(key) do update set value=excluded.value;`);
  await expectError(buy(10),"marketplace_membership_required");await db.query("insert into prime_accounts(profile_id,status,prime_expires_at) values($1,'active',now()+interval '1 day')",[buyer]);
  await buy(10);assert.equal((await one("select metadata from wallet_transactions where lead_purchase_id=$1",[(await booking(10)).lead_purchase_id])).metadata.prime_purchase,false);checks++;
  await db.exec(`update settings set value='{"paidAccessEnabled":false}'::jsonb where key='marketplace.membership';`);

  // Existing marketplace promotion capture remains independent from the qualifier's EUR 3.
  await db.exec("update team_compensation_settings set marketplace_promotion_enabled=true,marketplace_promotion_sale_cents=500;");
  await db.query("insert into marketplace_lead_promotions(lead_id,member_id,assigned_by,assigned_at,publication_at,amount_cents_snapshot,wait_minutes_snapshot,state) select id,$2,$3,now(),published_at,500,0,'assigned' from leads where id=$1",[lead(11),promoter,admin]);
  const promoted=await buy(11);await db.query("select process_marketplace_promotion_sale($1)",[lead(11)]);
  assert.equal((await one("select member_id from team_compensation_events where id=$1",[(await booking(11)).compensation_event_id])).member_id,qualifier);assert.equal((await one("select amount_cents from team_compensation_events where source_event_key=$1",[`marketplace_promotion_sale:${lead(11)}`])).amount_cents,500);checks+=2;
  assert.equal((await one("select amount_cents from lead_purchases where id=$1",[promoted.purchaseId])).amount_cents,6500);checks++;

  // Recorded payouts survive the negative booking adjustment; no payment history is deleted.
  await db.query("select record_team_compensation_payout($1,300,'bank_transfer','fixture',null,now(),$2)",[qualifier,admin]);
  const payoutsBefore=await count("team_compensation_payouts");await refund(11);assert.equal(await count("team_compensation_payouts"),payoutsBefore);assert.equal((await one("select amount_cents from team_compensation_events where id=$1",[(await booking(11)).reversal_event_id])).amount_cents,-300);checks+=2;
  const freshProfile=uuid(1,6),freshMember=uuid(3,3);
  await db.query("insert into profiles(id,email,status) values($1,'fresh-qualifier@example.invalid','active')",[freshProfile]);
  await db.query("insert into team_members(id,profile_id,role_id,status) values($1,$2,$3,'active')",[freshMember,freshProfile,uuid(8)]);
  await makeLead(23,{member:freshMember});await buy(23);const alreadyPaid=await booking(23);
  await db.query("select record_team_compensation_payout($1,600,'bank_transfer','fixture full payout',null,now(),$2)",[freshMember,admin]);
  assert.equal((await one("select sum(amount_cents)::int amount from team_compensation_payout_allocations where compensation_event_id=$1",[alreadyPaid.compensation_event_id])).amount,300);checks++;
  await refund(23);assert.equal((await one("select sum(amount_cents)::int amount from team_compensation_events where member_id=$1 and status='accrued'",[freshMember])).amount,300);assert.equal((await one("select sum(amount_cents)::int amount from team_compensation_payouts where member_id=$1 and status='completed'",[freshMember])).amount,600);checks+=2;
  await db.exec("update settings set value='false'::jsonb where key='lead.booking_call_enabled';");
  assert.equal((await buy(1)).replayed,true);checks++;await expectError(buy(12),"booking_call_disabled");
  await refund(1);assert.equal((await booking(1)).status,"refunded");checks++;
  checks += await testBookingWorkflow({ db, sql, one, expectError, makeLead, buy, booking, refund, count, lead, request, token, uuid, buyer, admin, qualifier, qualifierProfile, promoter, promoterProfile });
  for(const f of originalFunctions){assert.equal((await one("select pg_get_functiondef($1) body",[f.oid])).body,f.body);checks++;}
  console.log(JSON.stringify({passed:true,checks,isolatedPostgres:true,oldPurchaseAndRefundFunctionsUnchanged:true,atomicRollback:true,retries:true,fullRefundIncludesFee:true,bookingOnlyReversal:true,pendingAttributionPair:true,productionReads:0,productionWrites:0}));
} finally { await db.close(); }
