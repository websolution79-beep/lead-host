import assert from "node:assert/strict";
import test from "node:test";
import { marketplaceEmailEventType } from "./emails";

test("maps Marketplace activation to the configured customer and admin templates", () => {
  assert.equal(marketplaceEmailEventType("activation", false), "marketplace.activated");
  assert.equal(marketplaceEmailEventType("activation", true), "admin.marketplace_activated");
});

test("maps every Marketplace lifecycle notification to its configured template", () => {
  assert.equal(
    marketplaceEmailEventType("payment_received", false),
    "marketplace.payment_received",
  );
  assert.equal(
    marketplaceEmailEventType("cancellation_scheduled", true),
    "admin.marketplace_cancellation_scheduled",
  );
  assert.equal(
    marketplaceEmailEventType("payment_action_required", false),
    "marketplace.payment_action_required",
  );
  assert.equal(
    marketplaceEmailEventType("payment_failed", true),
    "admin.marketplace_payment_failed",
  );
});
