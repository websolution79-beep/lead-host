const META_PIXEL_SCRIPT_ID = "leadhost-meta-pixel";
const META_PIXEL_SCRIPT_URL =
  "https://connect.facebook.net/en_US/fbevents.js";

type MetaPixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
  push: (...args: unknown[]) => void;
};

type MetaPixelRuntime = {
  initializedPixelId: string | null;
  consentGranted: boolean;
  lastPageViewKey: string | null;
  lastEventId: string | null;
};

export function grantMetaPixelConsent(pixelId: string) {
  const fbq = ensureMetaPixelQueue();
  const runtime = getMetaPixelRuntime();

  fbq("consent", "revoke");
  ensureMetaPixelScript();
  fbq("consent", "grant");

  if (runtime.initializedPixelId !== pixelId) {
    fbq("init", pixelId);
    fbq("set", "autoConfig", false, pixelId);
    runtime.initializedPixelId = pixelId;
    runtime.lastPageViewKey = null;
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

function ensureMetaPixelQueue() {
  if (window.fbq) return window.fbq;

  const fbq = function metaPixelQueue(...args: unknown[]) {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
      return;
    }

    fbq.queue.push(args);
  } as MetaPixelFunction;

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
