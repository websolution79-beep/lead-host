import type { BrowserTrackingEventName } from "@/lib/tracking/browser-events";

type HotjarCommand = "event" | "stateChange";
type Hotjar = (command: HotjarCommand, value: string) => void;

const SCRIPT_ID = "leadhost-hotjar";
const HOTJAR_SNIPPET_VERSION = 6;
const trackedEventIds = new Set<string>();

export const hotjarBrowserEventNames: Record<
  BrowserTrackingEventName,
  string
> = {
  telegram_join_click: "telegram_join_click",
  lead: "pm_registration_created",
  complete_registration: "pm_registration_confirmed",
};

export function initializeHotjar({
  siteId,
  suppressPageContent,
}: {
  siteId: string;
  suppressPageContent: boolean;
}) {
  if (typeof window === "undefined" || !isHotjarSiteId(siteId)) {
    return false;
  }

  setHotjarContentSuppression(suppressPageContent);
  ensureHotjarQueue();

  if (!document.getElementById(SCRIPT_ID)) {
    window._hjSettings = {
      hjid: Number(siteId),
      hjsv: HOTJAR_SNIPPET_VERSION,
    };

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://static.hotjar.com/c/hotjar-${encodeURIComponent(
      siteId,
    )}.js?sv=${HOTJAR_SNIPPET_VERSION}`;
    document.head.appendChild(script);
  }

  return true;
}

export function trackHotjarStateChange({
  siteId,
  pagePath,
  suppressPageContent,
}: {
  siteId: string;
  pagePath: string;
  suppressPageContent: boolean;
}) {
  if (!initializeHotjar({ siteId, suppressPageContent })) return false;

  ensureHotjarQueue()("stateChange", pagePath);
  return true;
}

export function trackHotjarBrowserEvent({
  siteId,
  eventName,
  eventId,
  suppressPageContent,
}: {
  siteId: string;
  eventName: BrowserTrackingEventName;
  eventId: string;
  suppressPageContent: boolean;
}) {
  if (
    trackedEventIds.has(eventId) ||
    !initializeHotjar({ siteId, suppressPageContent })
  ) {
    return false;
  }

  trackedEventIds.add(eventId);
  ensureHotjarQueue()("event", hotjarBrowserEventNames[eventName]);
  return true;
}

export function setHotjarContentSuppression(suppress: boolean) {
  if (typeof document === "undefined") return;

  if (suppress) {
    document.body.setAttribute("data-hj-suppress", "");
    document.body.dataset.leadHostHotjarSuppressed = "true";
    return;
  }

  if (document.body.dataset.leadHostHotjarSuppressed === "true") {
    document.body.removeAttribute("data-hj-suppress");
    delete document.body.dataset.leadHostHotjarSuppressed;
  }
}

function ensureHotjarQueue(): Hotjar {
  window.hj =
    window.hj ??
    ((command: HotjarCommand, value: string) => {
      window.hj!.q = window.hj!.q ?? [];
      window.hj!.q!.push([command, value]);
    });

  return window.hj;
}

function isHotjarSiteId(value: string) {
  return /^\d{3,12}$/.test(value.trim());
}

declare global {
  interface Window {
    hj?: Hotjar & {
      q?: Array<[HotjarCommand, string]>;
    };
    _hjSettings?: {
      hjid: number;
      hjsv: number;
    };
  }
}
