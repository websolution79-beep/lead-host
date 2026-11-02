import assert from "node:assert/strict";

// Shared isolated fixture; this module is called by test-booking-call-wallet-db.mjs.
export async function testBookingWorkflow(f) {
  const { db, sql, one, expectError, makeLead, buy, booking, refund, count, lead, request, token, uuid, buyer, admin, qualifier, qualifierProfile, promoter, promoterProfile } = f;
  let checks = 0;
  const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
  await db.exec("alter type app_role add value if not exists 'team_member'");
  await db.query("insert into user_roles(profile_id,role) values($1,'team_member'),($2,'team_member') on conflict do nothing", [qualifierProfile,promoterProfile]);
  await db.exec(await sql("202611020003_marketplace_booking_call_workflow"));
  await db.exec(await sql("202611020003_marketplace_booking_call_workflow"));
  const ready = (await one("select get_marketplace_booking_call_readiness_v3() r")).r;
  equal(ready.workflowReady,true); equal(ready.schemaVersion,3); equal(ready.enabled,false);
  for (const role of ["anon","authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      for (const [query,args] of [
        ["select get_booking_call_task($1,$2,null)",[admin,token(1)]],
        ["select update_booking_call_task($1,$2,'in_progress',null)",[admin,token(1)]],
        ["select retry_booking_call_email($1,$2)",[admin,token(1)]],
        ["select * from claim_booking_call_emails(1,null)",[]],
        ["select get_booking_call_email_context($1,$2)",[token(1),uuid(9)]],
        ["select finish_booking_call_email($1,$2,'sent',null)",[token(1),uuid(9)]],
        ["select booking_call_context_internal($1)",[token(1)]],
      ]) await expectError(db.query(query,args),"permission denied");
    } finally { await db.exec("reset role"); }
  }
  await db.exec("set role service_role");
  try { await expectError(db.query("select booking_call_context_internal($1)",[token(1)]),"permission denied"); }
  finally { await db.exec("reset role"); }
  await db.exec("update settings set value='true'::jsonb where key='lead.booking_call_enabled'");
  for (let n=24;n<=28;n++) {
    await makeLead(n,{claim:n!==27});
    await db.query("insert into owner_contacts(owner_request_id,first_name,last_name,email,phone) values($1,'Owner','Fixture','owner@example.invalid','3330000000')",[request(n)]);
    await buy(n);
  }
  const get = async (actor,id=token(24),byLead=null) => (await one("select get_booking_call_task($1,$2,$3) r",[actor,id,byLead])).r;
  const mutate = (actor,status,at=null,id=token(24)) => db.query("select update_booking_call_task($1,$2,$3,$4) r",[actor,id,status,at]);
  const claim = async (id=token(24)) => one("select * from claim_booking_call_emails(1,$1)",[id]);
  const email = async (job) => (await one("select get_booking_call_email_context($1,$2) r",[job.booking_call_id,job.lease_id])).r;
  const finish = async (job,status="sent") => (await one("select finish_booking_call_email($1,$2,$3,null) r",[job.booking_call_id,job.lease_id,status])).r;
  const retry = async (actor=qualifierProfile,id=token(24)) => (await one("select retry_booking_call_email($1,$2) r",[actor,id])).r;
  equal((await get(admin)).owner.phone,"3330000000"); equal((await get(qualifierProfile)).buyer.email,"buyer@example.invalid");
  equal(await get(promoterProfile),null); equal(await get(buyer),null);
  equal((await get(qualifierProfile,null,lead(24))).id,token(24));
  await expectError(db.query("select get_booking_call_task($1,$2,$3)",[admin,token(24),lead(24)]),"booking_task_identifier_invalid");
  await expectError(mutate(promoterProfile,"in_progress"),"booking_task_not_authorized");
  await expectError(mutate(qualifierProfile,"scheduled"),"booking_task_date_required");
  const beforeEvents=await count("team_compensation_events");
  const beforeOwner=await one("select updated_at from owner_requests where id=$1",[request(24)]);
  await mutate(qualifierProfile,"in_progress");
  await mutate(qualifierProfile,"scheduled","2026-11-10T15:30:00Z");
  equal((await get(qualifierProfile)).status,"scheduled"); equal(Date.parse((await get(admin)).scheduledAt),Date.parse("2026-11-10T15:30:00Z"));
  equal(await count("team_compensation_events"),beforeEvents); equal(await one("select updated_at from owner_requests where id=$1",[request(24)]),beforeOwner);
  const updated=(await one("select updated_at from marketplace_booking_calls where id=$1",[token(24)])).updated_at;
  await mutate(qualifierProfile,"scheduled","2026-11-10T15:30:00Z"); equal((await one("select updated_at from marketplace_booking_calls where id=$1",[token(24)])).updated_at,updated);
  await mutate(qualifierProfile,"to_schedule"); equal((await get(admin)).scheduledAt,null);
  const job=await claim(); equal(job.booking_call_id,token(24)); equal(await claim(),undefined);
  let ctx=await email(job); equal(ctx.recipients.map(r=>r.profileId),[qualifierProfile]); equal(ctx.totalAmountCents,6500);
  equal(ctx.buyer.profileId,buyer); equal(ctx.propertyManagerId,(await booking(24)).property_manager_id);
  equal((await one("select get_booking_call_email_context($1,$2) r",[token(24),uuid(99)])).r,null);
  equal(await retry(),false); equal(await finish({...job,lease_id:uuid(99)}),false);
  await db.query("update marketplace_booking_call_email_outbox set locked_at=now()-interval '4 minutes' where booking_call_id=$1",[token(24)]);
  equal(await email(job),null);
  const reclaimed=await claim(); assert.notEqual(reclaimed.lease_id,job.lease_id);checks++;
  equal(await finish(job),false); equal(await finish(reclaimed,"pending"),true); equal(await claim(),undefined);
  equal(await retry(),true); const retried=await claim(); equal(await finish(retried),true); equal((await get(admin)).emailStatus,"sent");
  equal(await retry(),true); equal(await finish(await claim()),true);
  await expectError(db.query("select retry_booking_call_email($1,$2)",[promoterProfile,token(24)]),"booking_task_not_authorized");
  await db.query("update team_members set status='inactive' where id=$1",[qualifier]);
  equal(await get(qualifierProfile),null); ctx=await email(await claim(token(25))); equal(ctx.recipients.map(r=>r.profileId),[admin]);
  await db.query("update team_members set status='active' where id=$1",[qualifier]);
  await db.query("delete from user_roles where profile_id=$1 and role='team_member'",[qualifierProfile]);
  ctx=await email(await claim(token(26))); equal(ctx.recipients.map(r=>r.profileId),[admin]);
  await db.query("insert into user_roles(profile_id,role) values($1,'team_member')",[qualifierProfile]);
  const noQualifier=await claim(token(27)); ctx=await email(noQualifier); equal(ctx.needsAttribution,true); equal(ctx.recipients.map(r=>r.profileId),[admin]);
  await db.query("select attribute_booking_call_compensation($1,$2,$3)",[token(27),promoter,admin]);
  equal(await email(noQualifier),null); equal(await finish(noQualifier),false);
  const reassigned=await claim(token(27)); equal((await email(reassigned)).recipients.map(r=>r.profileId),[promoterProfile]);
  equal((await get(promoterProfile,token(27))).assignedMemberId,promoter); equal(await get(qualifierProfile,token(27)),null);
  const refundedJob=await claim(token(28)); await refund(28);
  equal(await email(refundedJob),null); equal(await finish(refundedJob),false); equal(await claim(token(28)),undefined);
  await expectError(mutate(qualifierProfile,"in_progress",null,token(28)),"booking_purchase_refunded");
  await expectError(db.query("select retry_booking_call_email($1,$2)",[admin,token(28)]),"booking_purchase_refunded");
  equal((await get(admin,token(28))).status,"refunded");
  await db.exec("update settings set value='false'::jsonb where key='lead.booking_call_enabled'");
  return checks;
}
