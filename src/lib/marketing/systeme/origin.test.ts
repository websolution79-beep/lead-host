import assert from "node:assert/strict";
import test from "node:test";
import { systemeWebhookOrigin } from "./origin";

test("production and local settings retain the canonical origin", () => {
  for (const VERCEL_ENV of [undefined, "development", "production"]) {
    assert.equal(systemeWebhookOrigin("https://www.leadhost.it", { VERCEL_ENV, VERCEL_BRANCH_URL: "preview.vercel.app" }), "https://www.leadhost.it");
  }
});

test("preview webhooks use the stable branch alias instead of production", () => {
  assert.equal(systemeWebhookOrigin("https://www.leadhost.it", {
    VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "lead-host-git-codex-systeme-preview.vercel.app", VERCEL_URL: "lead-host-build.vercel.app",
  }), "https://lead-host-git-codex-systeme-preview.vercel.app");
});

test("preview can fall back to the deployment hostname", () => {
  assert.equal(systemeWebhookOrigin("https://www.leadhost.it", { VERCEL_ENV: "preview", VERCEL_URL: "lead-host-build.vercel.app" }), "https://lead-host-build.vercel.app");
});

test("preview fails closed for missing or untrusted deployment hosts", () => {
  for (const host of [undefined, "other.test", "preview.vercel.app/other", "preview.vercel.app@other.test"]) {
    assert.throws(() => systemeWebhookOrigin("https://www.leadhost.it", { VERCEL_ENV: "preview", VERCEL_BRANCH_URL: host }));
  }
});
