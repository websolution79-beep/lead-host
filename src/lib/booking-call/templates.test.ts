import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { defaultTransactionalEmailTemplates, fetchTransactionalEmailTemplates, renderTransactionalEmailTemplate } from "@/lib/config/transactional-email-settings";
import { defaultCommercialSettings, saveCommercialSettings } from "@/lib/config/commercial-settings";

test("booking templates contain both contacts, escaped content and the correct operational link", () => {
  const team = defaultTransactionalEmailTemplates.find(item => item.id === "team.booking_call_requested")!;
  const rendered = renderTransactionalEmailTemplate({ template: team, variables: {
    lead_title: "Casa <Milano>", owner_phone: "3331111111", property_manager_phone: "3332222222", booking_call_id: "booking-test", commission_notice: "Compenso da attribuire",
  } });
  assert.match(rendered.text, /3331111111/); assert.match(rendered.text, /3332222222/);
  assert.match(rendered.html, /Casa &lt;Milano&gt;/); assert.match(rendered.text, /\/admin\/booking-call\/booking-test/);
  const pm = defaultTransactionalEmailTemplates.find(item => item.id === "lead.booking_call_purchased")!;
  assert.match(renderTransactionalEmailTemplate({ template: pm, variables: {} }).text, /Non contattare direttamente il proprietario/);
});

test("new defaults preserve all saved templates including administrator changes", async () => {
  const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: null, data: { value: [
    { id: "admin.lead_purchased", subject: "Privato", body: "Testo salvato", enabled: false },
    { id: "lead.booking_call_purchased", subject: "Booking personalizzato", enabled: false },
  ] } }) }) }) }) } as unknown as SupabaseClient<Database>;
  const { templates } = await fetchTransactionalEmailTemplates(client);
  assert.equal(templates.find(item => item.id === "admin.lead_purchased")?.subject, "Privato");
  assert.equal(templates.find(item => item.id === "admin.lead_purchased")?.enabled, false);
  assert.equal(templates.find(item => item.id === "lead.booking_call_purchased")?.subject, "Booking personalizzato");
  assert.equal(templates.find(item => item.id === "lead.booking_call_purchased")?.enabled, false);
  assert.ok(templates.find(item => item.id === "team.booking_call_requested"));
});

test("older settings callers cannot reset or activate booking", async () => {
  const rows: Array<{ key: string; value: unknown }> = [];
  const client = { from: () => ({ upsert: async (data: typeof rows) => { rows.push(...data); return { error: null }; } }) } as unknown as SupabaseClient<Database>;
  const { bookingCallEnabled: _enabled, bookingCallFeeCents: _fee, ...legacy } = defaultCommercialSettings;
  assert.equal(_enabled, false); assert.equal(_fee, 0);
  await saveCommercialSettings({ supabase: client, profileId: "admin", settings: legacy });
  assert.equal(rows.some(row => row.key.includes("booking_call")), false);
  rows.length = 0;
  await saveCommercialSettings({ supabase: client, profileId: "admin", settings: { ...legacy, bookingCallEnabled: false, bookingCallFeeCents: 1500 } });
  assert.equal(rows.find(row => row.key === "lead.booking_call_fee_cents")?.value, 1500);
  assert.equal(rows.find(row => row.key === "lead.booking_call_enabled")?.value, false);
});
