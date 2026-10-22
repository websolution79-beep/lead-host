import test from "node:test";
import assert from "node:assert/strict";
import { getPmSignupMarketingActivation, PM_SIGNUP_NOTICE_TEXT, PM_SIGNUP_NOTICE_VERSION, PM_SIGNUP_AUTOMATIC_MARKETING_VERSION } from "./pm-signup-notice";

test("the mandatory notice matches the exact requested text", () => {
  assert.equal(PM_SIGNUP_NOTICE_TEXT, "Preso visione della Privacy Policy e accettazione dei Termini e Condizioni inclusa la possibilità di ricevere chiamate esplicative.");
});

test("the new form enables marketing automatically, not as an explicit checkbox", () => {
  assert.deepEqual(getPmSignupMarketingActivation({ signupNoticeVersion: PM_SIGNUP_NOTICE_VERSION }, "1.0"), {
    enabled: true, automatic: true, source: "pm_signup_automatic", policyVersion: PM_SIGNUP_AUTOMATIC_MARKETING_VERSION,
  });
});

test("an old open form retains its actual optional refusal or acceptance", () => {
  assert.deepEqual(getPmSignupMarketingActivation({ emailMarketingConsent: false }, "1.0"), { enabled: false, automatic: false, source: "pm_registration", policyVersion: "1.0" });
  assert.deepEqual(getPmSignupMarketingActivation({ emailMarketingConsent: true }, "1.0"), { enabled: true, automatic: false, source: "pm_registration", policyVersion: "1.0" });
  assert.equal(getPmSignupMarketingActivation({}, "1.0").enabled, false);
});
