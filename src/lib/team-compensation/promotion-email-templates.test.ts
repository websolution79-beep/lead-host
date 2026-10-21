import assert from "node:assert/strict";
import test from "node:test";
import { defaultTransactionalEmailTemplates, renderTransactionalEmailTemplate, fetchTransactionalEmailTemplates } from "@/lib/config/transactional-email-settings";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchPromotionSaleSummary } from "./promotion-sale-summary";

test("member template contains only the earned compensation and earnings link", () => {
  const template = defaultTransactionalEmailTemplates.find((t) => t.id === "team.marketplace_promotion_earned")!;
  const rendered = renderTransactionalEmailTemplate({ template, variables: { member_name: "Giorgia", lead_title: "Casa <Milano>", commission_amount: "5,00 EUR" } });
  assert.match(rendered.text, /Giorgia/);
  assert.match(rendered.text, /5,00 EUR/);
  assert.match(rendered.html, /Casa &lt;Milano&gt;/);
  assert.match(rendered.text, /\/admin\/i-miei-guadagni/);
  assert.equal(defaultTransactionalEmailTemplates.some((t) => t.id.startsWith("team.") && /storno|rimbors/i.test(t.label)), false);
});

test("administrator optional block is absent without promotion, and escaped when present", () => {
  const template = defaultTransactionalEmailTemplates.find((t) => t.id === "admin.lead_purchased")!;
  const absent = renderTransactionalEmailTemplate({ template, variables: {} });
  assert.doesNotMatch(absent.text, /Promozione assegnata/);
  const present = renderTransactionalEmailTemplate({ template, variables: { promotion_details: "Promozione assegnata a: Giorgia <Test>" } });
  assert.match(present.html, /Promozione assegnata a: Giorgia &lt;Test&gt;/);
  assert.match(present.text, /Promozione assegnata a: Giorgia <Test>/);
});

test("new template does not replace saved administrator customizations", async () => {
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: null, data: { key: "email.transactional_templates", value: [{ id: "admin.lead_purchased", subject: "Personalizzato", body: "Testo privato", extra: "Altri dati\n{{promotion_details}}", enabled: false }] } }) }) }) }) } as unknown as SupabaseClient<Database>;
  const { templates } = await fetchTransactionalEmailTemplates(db);
  const admin = templates.find((t) => t.id === "admin.lead_purchased")!;
  assert.equal(admin.subject, "Personalizzato"); assert.equal(admin.body, "Testo privato"); assert.equal(admin.enabled, false);
  assert.ok(templates.find((t) => t.id === "team.marketplace_promotion_earned"));
});

test("admin summary uses the captured purchase member, not current lead assignment", async () => {
  const reads: string[] = [];
  const data: Record<string, unknown> = {
    marketplace_lead_promotion_sales: { member_id: "member-snapshot", amount_cents: 500 },
    team_members: { profile_id: "profile-snapshot" }, profiles: { first_name: "Giorgia", last_name: "Test" },
  };
  const db = { from: (table: string) => { reads.push(table); return { select: () => ({ eq: (_: string, id: string) => { if (table === "marketplace_lead_promotion_sales") assert.equal(id, "purchase-original"); return { maybeSingle: async () => ({ data: data[table], error: null }) }; } }) }; } } as unknown as SupabaseClient<Database>;
  const summary = await fetchPromotionSaleSummary(db, "purchase-original");
  assert.equal(summary.promotion_member_name, "Giorgia Test");
  assert.match(summary.promotion_details, /Giorgia Test/);
  assert.equal(reads.includes("marketplace_lead_promotions"), false);
  data.marketplace_lead_promotion_sales = null;
  assert.deepEqual(await fetchPromotionSaleSummary(db, "purchase-original"), { promotion_member_name: "", promotion_compensation: "", promotion_details: "" });
});
