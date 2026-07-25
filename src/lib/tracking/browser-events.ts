import type { TrackingEventId } from "@/lib/config/tracking-settings";
import {
  parseIubendaConsent,
  pendingTrackingConsent,
} from "@/lib/tracking/consent";

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
  options?: {
    eventId?: string | null;
  },
) {
  if (typeof window === "undefined") return null;

  const consent = getResolvedBrowserConsent();
  const event: BrowserTrackingEvent = {
    eventName,
    eventId: normalizeEventId(options?.eventId) ?? createEventId(eventName),
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

export function getBrowserTrackingConsentSnapshot() {
  if (typeof window === "undefined") {
    return {
      resolved: false,
      measurement: false,
      marketing: false,
    };
  }

  const consent = getResolvedBrowserConsent();

  return {
    resolved: consent?.resolved === true,
    measurement: consent?.measurement === true,
    marketing: consent?.marketing === true,
  };
}

function getResolvedBrowserConsent() {
  const current = window.__leadHostTrackingConsent;
  if (current?.resolved) return current;

  try {
    const preference = window._iub?.cs?.api?.getPreferences?.();
    const parsed = parseIubendaConsent(preference);

    return parsed.resolved ? parsed : current ?? pendingTrackingConsent;
  } catch {
    return current ?? pendingTrackingConsent;
  }
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

function normalizeEventId(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length <= 160 ? normalized : null;
}

declare global {
  interface Window {
    __leadHostBrowserTrackingQueue?: BrowserTrackingEvent[];
  }

  interface WindowEventMap {
    [BROWSER_TRACKING_EVENT]: CustomEvent<BrowserTrackingEvent>;
  }
}
