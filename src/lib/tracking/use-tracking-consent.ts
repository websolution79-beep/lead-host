"use client";

import { useEffect, useState } from "react";
import {
  TRACKING_CONSENT_EVENT,
  pendingTrackingConsent,
  type TrackingConsentState,
} from "@/lib/tracking/consent";

export function useTrackingConsent() {
  const [consent, setConsent] = useState<TrackingConsentState>(
    pendingTrackingConsent,
  );

  useEffect(() => {
    function handleConsent(event: CustomEvent<TrackingConsentState>) {
      setConsent(event.detail);
    }

    window.addEventListener(TRACKING_CONSENT_EVENT, handleConsent);
    const timeoutId = window.setTimeout(() => {
      setConsent(
        window.__leadHostTrackingConsent ?? pendingTrackingConsent,
      );
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener(TRACKING_CONSENT_EVENT, handleConsent);
    };
  }, []);

  return consent;
}
