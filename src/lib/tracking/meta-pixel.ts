const META_PIXEL_SCRIPT_ID = "leadhost-meta-pixel";
const META_PIXEL_SCRIPT_URL =
  "https://connect.facebook.net/en_US/fbevents.js";

type MetaPixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: IArguments[];
  loaded: boolean;
  version: string;
  push: (...args: unknown[]) => void;
};

type MetaPixelRuntime = {
  initializedPixelId: string | null;
  consentGranted: boolean;
  lastPageViewKey: string | null;
  lastEventId: string | null;
  trackedEventIds: Set<string>;
};

export type MetaBrowserEventName =
  | "view_content"
  | "telegram_join_click"
  | "lead"
  | "complete_registration"
  | "initiate_checkout"
  | "lead_purchase";

export function grantMetaPixelConsent(pixelId: string) {
  const fbq = ensureMetaPixelQueue();
  const runtime = getMetaPixelRuntime();
  const isRegrant =
    runtime.initializedPixelId !== null && !runtime.consentGranted;

  ensureMetaPixelScript();

  if (runtime.initializedPixelId !== pixelId) {
    fbq("init", pixelId);
    fbq("set", "autoConfig", false, pixelId);
    runtime.initializedPixelId = pixelId;
    runtime.lastPageViewKey = null;
  }

  if (isRegrant) {
    fbq("consent", "grant");
  }

  runtime.consentGranted = true;
}

export function revokeMetaPixelConsent() {
  const runtime = getMetaPixelRuntime();
  runtime.consentGranted = false;

  if (window.fbq) {
    window.fbq("consent", "revoke");
  }
}

export function trackMetaPageView({
  pixelId,
  pageKey,
}: {
  pixelId: string;
  pageKey: string;
}) {
  const runtime = getMetaPixelRuntime();

  if (
    !window.fbq ||
    !runtime.consentGranted ||
    runtime.initializedPixelId !== pixelId ||
    runtime.lastPageViewKey === pageKey
  ) {
    return null;
  }

  const eventId = createEventId();
  window.fbq("track", "PageView", {}, { eventID: eventId });
  runtime.lastPageViewKey = pageKey;
  runtime.lastEventId = eventId;

  return eventId;
}

export function trackMetaBrowserEvent({
  pixelId,
  eventName,
  eventId,
  pagePath,
}: {
  pixelId: string;
  eventName: MetaBrowserEventName;
  eventId: string;
  pagePath: string;
}) {
  const runtime = getMetaPixelRuntime();

  if (
    !window.fbq ||
    !runtime.consentGranted ||
    runtime.initializedPixelId !== pixelId ||
    runtime.trackedEventIds.has(eventId)
  ) {
    return null;
  }

  if (eventName === "view_content") {
    window.fbq("track", "ViewContent", {}, { eventID: eventId });
  } else if (eventName === "telegram_join_click") {
    const pageUrl = new URL(pagePath, window.location.origin).toString();
    window.fbq(
      "trackCustom",
      "TelegramJoinClick",
      {
        event_source_url: pageUrl,
        page_path: pagePath,
        page_url: pageUrl,
      },
      { eventID: eventId },
    );
  } else if (eventName === "lead") {
    window.fbq("track", "Lead", {}, { eventID: eventId });
  } else if (eventName === "complete_registration") {
    window.fbq(
      "track",
      "CompleteRegistration",
      {},
      { eventID: eventId },
    );
  } else if (eventName === "initiate_checkout") {
    window.fbq("track", "InitiateCheckout", {}, { eventID: eventId });
  } else {
    window.fbq("trackCustom", "LeadPurchase", {}, { eventID: eventId });
  }

  runtime.trackedEventIds.add(eventId);
  runtime.lastEventId = eventId;

  return eventId;
}

function ensureMetaPixelQueue() {
  if (window.fbq) return window.fbq;

  /* eslint-disable prefer-rest-params, prefer-spread */
  const fbq = function metaPixelQueue() {
    if (fbq.callMethod) {
      fbq.callMethod.apply(fbq, Array.from(arguments));
      return;
    }

    fbq.queue.push(arguments);
  } as MetaPixelFunction;
  /* eslint-enable prefer-rest-params, prefer-spread */

  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  window.fbq = fbq;
  window._fbq = fbq;

  return fbq;
}

function ensureMetaPixelScript() {
  if (document.getElementById(META_PIXEL_SCRIPT_ID)) return;

  const script = document.createElement("script");
  script.id = META_PIXEL_SCRIPT_ID;
  script.async = true;
  script.src = META_PIXEL_SCRIPT_URL;
  document.head.appendChild(script);
}

function getMetaPixelRuntime() {
  if (!window.__leadHostMetaPixel) {
    window.__leadHostMetaPixel = {
      initializedPixelId: null,
      consentGranted: false,
      lastPageViewKey: null,
      lastEventId: null,
      trackedEventIds: new Set<string>(),
    };
  }

  return window.__leadHostMetaPixel;
}

function createEventId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `page_view_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
    __leadHostMetaPixel?: MetaPixelRuntime;
  }
}
