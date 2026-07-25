import type { BrowserTrackingEventName } from "@/lib/tracking/browser-events";

type GtagCommand = "config" | "consent" | "event" | "get" | "js";
type Gtag = (command: GtagCommand, ...args: unknown[]) => void;

const SCRIPT_ID_PREFIX = "leadhost-ga4-";
const trackedPageKeys = new Set<string>();
const trackedEventIds = new Set<string>();
const configuredMeasurementIds = new Set<string>();

export const ga4BrowserEventNames: Record<
  BrowserTrackingEventName,
  string
> = {
  view_content: "view_item",
  telegram_join_click: "telegram_join_click",
  lead: "generate_lead",
  complete_registration: "sign_up",
  initiate_checkout: "begin_checkout",
  lead_purchase: "lead_purchase",
};

export function grantGoogleAnalyticsConsent(measurementId: string) {
  if (typeof window === "undefined" || !isMeasurementId(measurementId)) {
    return false;
  }

  const gtag = ensureGtag();
  gtag("consent", "update", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });

  if (!configuredMeasurementIds.has(measurementId)) {
    gtag("js", new Date());
    gtag("config", measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    configuredMeasurementIds.add(measurementId);
  }

  loadGoogleAnalyticsScript(measurementId);
  requestGoogleAnalyticsClientId(measurementId);
  return true;
}

export function revokeGoogleAnalyticsConsent() {
  if (typeof window === "undefined") return;

  ensureGtag()("consent", "update", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.__leadHostGa4ClientId = null;
}

export function trackGoogleAnalyticsPageView({
  measurementId,
  pageKey,
  pagePath,
}: {
  measurementId: string;
  pageKey: string;
  pagePath: string;
}) {
  if (
    typeof window === "undefined" ||
    trackedPageKeys.has(pageKey) ||
    !grantGoogleAnalyticsConsent(measurementId)
  ) {
    return false;
  }

  trackedPageKeys.add(pageKey);
  ensureGtag()("event", "page_view", {
    page_location: window.location.href,
    page_path: pagePath,
    page_title: document.title,
    send_to: measurementId,
  });
  return true;
}

export function trackGoogleAnalyticsBrowserEvent({
  measurementId,
  eventName,
  eventId,
}: {
  measurementId: string;
  eventName: BrowserTrackingEventName;
  eventId: string;
}) {
  if (
    trackedEventIds.has(eventId) ||
    !grantGoogleAnalyticsConsent(measurementId)
  ) {
    return false;
  }

  trackedEventIds.add(eventId);
  ensureGtag()("event", ga4BrowserEventNames[eventName], {
    event_id: eventId,
    send_to: measurementId,
  });
  return true;
}

export function getGoogleAnalyticsClientId() {
  if (typeof window === "undefined") return null;
  return normalizeClientId(window.__leadHostGa4ClientId);
}

export function requestGoogleAnalyticsClientId(measurementId: string) {
  if (typeof window === "undefined" || !isMeasurementId(measurementId)) {
    return;
  }

  ensureGtag()("get", measurementId, "client_id", (value: unknown) => {
    window.__leadHostGa4ClientId =
      typeof value === "string" ? normalizeClientId(value) : null;
  });
}

function ensureGtag(): Gtag {
  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    ((command: GtagCommand, ...args: unknown[]) => {
      window.dataLayer?.push([command, ...args]);
    });

  return window.gtag;
}

function loadGoogleAnalyticsScript(measurementId: string) {
  const scriptId = `${SCRIPT_ID_PREFIX}${measurementId}`;
  if (document.getElementById(scriptId)) return;

  const script = document.createElement("script");
  script.id = scriptId;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
    measurementId,
  )}`;
  document.head.appendChild(script);
}

function isMeasurementId(value: string) {
  return /^G-[A-Z0-9]{4,20}$/i.test(value.trim());
}

function normalizeClientId(value: string | null | undefined) {
  const normalized = value?.trim();

  return normalized && /^[A-Za-z0-9._-]{1,128}$/.test(normalized)
    ? normalized
    : null;
}

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: Gtag;
    __leadHostGa4ClientId?: string | null;
  }
}
