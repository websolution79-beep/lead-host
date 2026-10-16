import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSystemeAllowedPages, systemeSettingsSchema } from "./settings";

const settings = {
  enabled: false, importMode: "all", allowedPageUrls: [], destinationStageId: null,
  updatedAt: "2026-10-15T08:00:00.123456+00:00",
};

test("keeps all-pages default and the original optimistic-lock timestamp", () => {
  const parsed = systemeSettingsSchema.parse(settings);
  assert.equal(parsed.updatedAt, settings.updatedAt);
  assert.equal(parsed.enabled, false);
  assert.equal(parsed.importMode, "all");
});

test("selected-pages mode requires valid complete URLs", () => {
  assert.equal(systemeSettingsSchema.safeParse({ ...settings, importMode: "selected_pages" }).success, false);
  for (const url of ["relative/path", "javascript:alert(1)", "https://user:password@site.test"]) {
    assert.equal(systemeSettingsSchema.safeParse({ ...settings, importMode: "selected_pages", allowedPageUrls: [url] }).success, false);
  }
  assert.equal(systemeSettingsSchema.safeParse({ ...settings, importMode: "selected_pages", allowedPageUrls: ["https://site.test/landing?utm_source=meta"] }).success, true);
});

test("normalizes page filters without treating campaign URLs as different pages", () => {
  assert.deepEqual(normalizeSystemeAllowedPages([
    "https://SITE.test/landing/?utm_source=meta", "https://site.test/landing#form", "https://site.test/other", "",
  ]), ["https://site.test/landing", "https://site.test/other"]);
});

test("client payload cannot choose a different PM or integration", () => {
  assert.equal(systemeSettingsSchema.safeParse({ ...settings, profileId: "another-pm" }).success, false);
  assert.equal(systemeSettingsSchema.safeParse({ ...settings, integrationId: "another-connection" }).success, false);
});
