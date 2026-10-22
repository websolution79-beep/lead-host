export const PM_SIGNUP_NOTICE_VERSION = "pm-signup-2026-10-22";
export const PM_SIGNUP_AUTOMATIC_MARKETING_SOURCE = "pm_signup_automatic";
export const PM_SIGNUP_AUTOMATIC_MARKETING_VERSION = "signup-automatic-2026-10-22";

export const PM_SIGNUP_NOTICE_PARTS = {
  beforePrivacy: "Preso visione della ",
  privacy: "Privacy Policy",
  between: " e accettazione dei ",
  terms: "Termini e Condizioni",
  afterTerms: " inclusa la possibilità di ricevere chiamate esplicative.",
} as const;

export const PM_SIGNUP_NOTICE_TEXT = Object.values(PM_SIGNUP_NOTICE_PARTS).join("");

export function getPmSignupMarketingActivation(input: {
  signupNoticeVersion?: string;
  emailMarketingConsent?: boolean;
}, legacyPolicyVersion: string) {
  const automatic = input.signupNoticeVersion === PM_SIGNUP_NOTICE_VERSION;
  return {
    enabled: automatic || input.emailMarketingConsent === true,
    automatic,
    source: automatic ? PM_SIGNUP_AUTOMATIC_MARKETING_SOURCE : "pm_registration",
    policyVersion: automatic ? PM_SIGNUP_AUTOMATIC_MARKETING_VERSION : legacyPolicyVersion,
  };
}
