import test from "node:test";
import assert from "node:assert/strict";
import { selectReportableSubscriptions, subscriptionLifecycle, summarizeSubscriptions, type ReportingSubscription } from "./subscription-reporting";

const now = Date.parse("2026-10-16T12:00:00Z");
const before = "2026-10-15T12:00:00Z";
const after = "2026-11-16T12:00:00Z";
const products = [{id: "prime", slug: "lead-host-prime"}, {id: "market", slug: "marketplace"}, {id: "marketing", slug: "marketing"}];
const row = (patch: Partial<ReportingSubscription> = {}): ReportingSubscription => ({
  id: "s1", profile_id: "p1", addon_product_id: "market", status: "active", source: "stripe",
  stripe_subscription_id: "sub_1", cancel_at_period_end: false, trial_ends_at: null,
  current_period_ends_at: after, access_expires_at: null, updated_at: before, ...patch,
});

test("scheduled cancellation remains active until the paid period ends", () => {
  assert.deepEqual(summarizeSubscriptions([row({cancel_at_period_end: true})], now),
    {total:1,active:1,trialing:0,pastDue:0,cancelAtPeriodEnd:1,cancelled:0});
});
test("trial with renewals off stays trialing until its end, including exact boundary", () => {
  const trial = row({status:"trialing",trial_ends_at:after,cancel_at_period_end:true});
  assert.equal(summarizeSubscriptions([trial],now).trialing,1);
  assert.equal(summarizeSubscriptions([trial],Date.parse(after)).trialing,0);
  assert.equal(summarizeSubscriptions([trial],Date.parse(after)).cancelAtPeriodEnd,0);
});
test("expired active/manual rows and ended cancellations are not active", () => {
  assert.equal(subscriptionLifecycle(row({current_period_ends_at:before}),now),"canceled");
  assert.equal(subscriptionLifecycle(row({source:"manual",access_expires_at:before}),now),"canceled");
  assert.equal(subscriptionLifecycle(row({status:"canceled",current_period_ends_at:after}),now),"canceled");
});
test("payment problems remain separate from paid actives and trials", () => {
  const stats=summarizeSubscriptions([row({status:"past_due"}),row({status:"unpaid",id:"s2"})],now);
  assert.equal(stats.pastDue,2); assert.equal(stats.active,0);
});
test("newer abandoned checkout cannot hide an established subscription", () => {
  const valid=row(); const checkout=row({id:"checkout",stripe_subscription_id:null,status:"expired",updated_at:after});
  assert.deepEqual(selectReportableSubscriptions([checkout,valid],products,[]),[valid]);
});
test("incomplete Stripe subscriptions do not contribute to totals", () => {
  assert.equal(selectReportableSubscriptions([row({status:"incomplete"}),row({status:"incomplete_expired",id:"s2"})],products,[]).length,0);
});
test("PRIME selects the actually activated linked record before deduplication", () => {
  const valid=row({addon_product_id:"prime"});
  const technical=row({id:"technical",addon_product_id:"prime",updated_at:after});
  const account={addon_subscription_id:valid.id,access_source:"stripe",prime_started_at:before};
  assert.deepEqual(selectReportableSubscriptions([technical,valid],products,[account]),[valid]);
  assert.equal(selectReportableSubscriptions([valid],products,[]).length,0);
});
test("distinct products stay separate and newest valid row wins deterministically", () => {
  const older=row({id:"old"}); const latest=row({id:"latest",updated_at:after});
  const marketing=row({id:"marketing",addon_product_id:"marketing"});
  assert.deepEqual(selectReportableSubscriptions([older,latest,marketing],products,[]).map(s=>s.id),["latest","marketing"]);
});
test("manual indefinite grants are included and missing/invalid trials are not active", () => {
  const manual=row({source:"manual",stripe_subscription_id:null,current_period_ends_at:null});
  assert.equal(selectReportableSubscriptions([manual],products,[]).length,1);
  assert.equal(subscriptionLifecycle(manual,now),"active");
  assert.equal(subscriptionLifecycle(row({status:"trialing"}),now),"canceled");
  assert.equal(subscriptionLifecycle(row({status:"trialing",trial_ends_at:"invalid"}),now),"canceled");
});
test("reproduces the real all-renewals-off counter regression", () => {
  const rows=[...Array.from({length:7},(_,i)=>row({id:`a${i}`,cancel_at_period_end:true})),
    ...Array.from({length:16},(_,i)=>row({id:`t${i}`,status:"trialing",trial_ends_at:after,cancel_at_period_end:true})),
    ...Array.from({length:13},(_,i)=>row({id:`c${i}`,status:"canceled",cancel_at_period_end:true})),
    ...Array.from({length:7},(_,i)=>row({id:`p${i}`,status:"past_due"}))];
  assert.deepEqual(summarizeSubscriptions(rows,now),{total:43,active:7,trialing:16,pastDue:7,cancelAtPeriodEnd:23,cancelled:13});
});
