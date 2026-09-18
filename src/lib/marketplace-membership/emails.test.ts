import assert from "node:assert/strict";
import test from "node:test";
import { defaultTransactionalEmailTemplates, renderTransactionalEmailTemplate } from "../config/transactional-email-settings";

test("Marketplace provides editable activation/payment templates for PM and superadmin", () => {
  const templates = defaultTransactionalEmailTemplates.filter(t => t.id.includes("marketplace"));
  assert.equal(templates.length, 4);
  assert.equal(new Set(templates.map(t => t.id)).size, 4);
  for (const template of templates) {
    const variables = Object.fromEntries(template.variables.map(key => [key, `test-${key}`]));
    const rendered = renderTransactionalEmailTemplate({ template, variables });
    assert.ok(!rendered.text.includes("{{"));
    assert.ok(rendered.text.includes("test-customer_name"));
    assert.ok(template.ctaUrl.startsWith(template.id.startsWith("admin.") ? "/admin/" : "/app/"));
  }
});
