import type { TrackingEventId } from "@/lib/config/tracking-settings";

export const BROWSER_TRACKING_EVENT = "leadhost:browser-tracking-event";

export type BrowserTrackingEventName = Extract<
  TrackingEventId,
  "telegram_join_click" | "lead" | "complete_registration"
>;

export type BrowserTrackingEvent = {
  eventName: BrowserTrackingEventName;
  eventId: string;
  occurredAt: string;
  pagePath: string;
  consentAtDispatch: {
    resolved: boolean;
    measurement: boolean;
    marketing: boolean;
  };
};

const MAX_PENDING_EVENTS = 20;

export function dispatchBrowserTrackingEvent(
  eventName: BrowserTrackingEventName,
) {
  if (typeof window === "undefined") return null;

  const consent = window.__leadHostTrackingConsent;
  const event: BrowserTrackingEvent = {
    eventName,
    eventId: createEventId(eventName),
    occurredAt: new Date().toISOString(),
    pagePath: window.location.pathname,
    consentAtDispatch: {
      resolved: consent?.resolved === true,
      measurement: consent?.measurement === true,
      marketing: consent?.marketing === true,
    },
  };

  const queue = getBrowserTrackingQueue();
  queue.push(event);

  if (queue.length > MAX_PENDING_EVENTS) {
    queue.splice(0, queue.length - MAX_PENDING_EVENTS);
  }

  window.dispatchEvent(
    new CustomEvent(BROWSER_TRACKING_EVENT, { detail: event }),
  );

  return event.eventId;
}

export function getPendingBrowserTrackingEvents() {
  if (typeof window === "undefined") return [];
  return [...getBrowserTrackingQueue()];
}

export function acknowledgeBrowserTrackingEvent(eventId: string) {
  if (typeof window === "undefined") return;

  window.__leadHostBrowserTrackingQueue = getBrowserTrackingQueue().filter(
    (event) => event.eventId !== eventId,
  );
}

function getBrowserTrackingQueue() {
  if (!window.__leadHostBrowserTrackingQueue) {
    window.__leadHostBrowserTrackingQueue = [];
  }

  return window.__leadHostBrowserTrackingQueue;
}

function createEventId(eventName: BrowserTrackingEventName) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${eventName}_${crypto.randomUUID()}`;
  }

  return `${eventName}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

declare global {
  interface Window {
    __leadHostBrowserTrackingQueue?: BrowserTrackingEvent[];
  }

  interface WindowEventMap {
    [BROWSER_TRACKING_EVENT]: CustomEvent<BrowserTrackingEvent>;
  }
}
