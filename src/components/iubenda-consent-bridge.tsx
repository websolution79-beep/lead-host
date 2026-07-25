"use client";

import { useEffect } from "react";
import {
  IUBENDA_PREFERENCE_EVENT,
  IUBENDA_READY_EVENT,
  TRACKING_CONSENT_EVENT,
  parseIubendaConsent,
  pendingTrackingConsent,
  type TrackingConsentState,
} from "@/lib/tracking/consent";

export function IubendaConsentBridge() {
  useEffect(() => {
    function publish(preference: unknown) {
      const consent = parseIubendaConsent(preference);
      window.__leadHostTrackingConsent = consent;
      exposeConsentState(consent);
      window.dispatchEvent(
        new CustomEvent(TRACKING_CONSENT_EVENT, { detail: consent }),
      );
    }

    function readCurrentPreference() {
      try {
        publish(window._iub?.cs?.api?.getPreferences?.());
      } catch {
        publish(pendingTrackingConsent);
      }
    }

    function handlePreference(event: CustomEvent<unknown>) {
      publish(event.detail);
    }

    window.addEventListener(IUBENDA_READY_EVENT, readCurrentPreference);
    window.addEventListener(IUBENDA_PREFERENCE_EVENT, handlePreference);

    const timeoutId = window.setTimeout(readCurrentPreference, 0);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener(IUBENDA_READY_EVENT, readCurrentPreference);
      window.removeEventListener(IUBENDA_PREFERENCE_EVENT, handlePreference);
    };
  }, []);

  return null;
}

function exposeConsentState(consent: TrackingConsentState) {
  const root = document.documentElement;
  root.dataset.trackingConsent = consent.resolved ? "resolved" : "pending";
  root.dataset.trackingMeasurement = consent.measurement ? "granted" : "denied";
  root.dataset.trackingMarketing = consent.marketing ? "granted" : "denied";
}
