"use client";

import { useEffect } from "react";
import { dispatchBrowserTrackingEvent } from "@/lib/tracking/browser-events";
import { useTrackingConsent } from "@/lib/tracking/use-tracking-consent";

const optInVisitKey = "leadhost:workshop-replay:opt-in-visited";
const maxRedirectAgeMs = 2 * 60 * 60 * 1000;

export function WorkshopOptInTracker() {
  useEffect(() => {
    try {
      sessionStorage.setItem(optInVisitKey, String(Date.now()));
    } catch {
      // Storage restrictions must not block the Brevo form.
    }
  }, []);

  return null;
}

export function WorkshopReplayLeadTracker() {
  const consent = useTrackingConsent();

  useEffect(() => {
    if (!consent.resolved) return;

    try {
      const visitedAt = Number(sessionStorage.getItem(optInVisitKey));
      if (!visitedAt || Date.now() - visitedAt > maxRedirectAgeMs || visitedAt > Date.now()) {
        sessionStorage.removeItem(optInVisitKey);
        return;
      }

      sessionStorage.removeItem(optInVisitKey);
      if (consent.marketing) dispatchBrowserTrackingEvent("lead");
    } catch {
      // Tracking restrictions must not block access to the replay.
    }
  }, [consent.resolved, consent.marketing]);

  return null;
}
