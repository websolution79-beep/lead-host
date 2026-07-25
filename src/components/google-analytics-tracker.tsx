"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { TrackingSettings } from "@/lib/config/tracking-settings";
import {
  acknowledgeBrowserTrackingEvent,
  BROWSER_TRACKING_EVENT,
  getPendingBrowserTrackingEvents,
  type BrowserTrackingEvent,
} from "@/lib/tracking/browser-events";
import {
  canActivateTrackingProvider,
  type TrackingScopeId,
} from "@/lib/tracking/consent";
import {
  grantGoogleAnalyticsConsent,
  revokeGoogleAnalyticsConsent,
  trackGoogleAnalyticsBrowserEvent,
  trackGoogleAnalyticsPageView,
} from "@/lib/tracking/google-analytics";
import { useTrackingConsent } from "@/lib/tracking/use-tracking-consent";

type PublicTrackingResponse = {
  version: 1;
  storageReady: boolean;
  providers: TrackingSettings["providers"];
  events: TrackingSettings["events"];
};

export function GoogleAnalyticsTracker() {
  const pathname = usePathname();
  const consent = useTrackingConsent();
  const [configuration, setConfiguration] =
    useState<PublicTrackingResponse | null>(null);
  const scope = useMemo(() => getTrackingScope(pathname), [pathname]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadConfiguration() {
      try {
        const response = await fetch("/api/tracking/config", {
          signal: controller.signal,
        });

        if (!response.ok) return;
        setConfiguration(
          (await response.json()) as PublicTrackingResponse,
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          revokeGoogleAnalyticsConsent();
        }
      }
    }

    void loadConfiguration();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!configuration?.storageReady) {
      revokeGoogleAnalyticsConsent();
      return;
    }

    const settings = createSettings(configuration);
    const eventSettings = settings.events.page_view;
    const canTrack =
      eventSettings.enabled &&
      eventSettings.providers.includes("ga4") &&
      canActivateTrackingProvider({
        settings,
        providerId: "ga4",
        scope,
        consent,
      });

    if (!canTrack) {
      revokeGoogleAnalyticsConsent();
      return;
    }

    const measurementId = settings.providers.ga4.measurementId;
    grantGoogleAnalyticsConsent(measurementId);
    trackGoogleAnalyticsPageView({
      measurementId,
      pageKey: `${scope}:${pathname}`,
      pagePath: pathname,
    });
  }, [configuration, consent, pathname, scope]);

  useEffect(() => {
    function processEvent(event: BrowserTrackingEvent) {
      if (!configuration) return;

      if (!configuration.storageReady || !consent.resolved) {
        if (!configuration.storageReady) {
          acknowledgeBrowserTrackingEvent(event.eventId, "ga4");
        }
        return;
      }

      const settings = createSettings(configuration);
      const eventSettings = settings.events[event.eventName];
      const eventScope = getTrackingScope(event.pagePath);
      const canTrack =
        event.consentAtDispatch.resolved &&
        event.consentAtDispatch.measurement &&
        eventSettings.enabled &&
        eventSettings.providers.includes("ga4") &&
        canActivateTrackingProvider({
          settings,
          providerId: "ga4",
          scope: eventScope,
          consent,
        });

      if (canTrack) {
        const measurementId = settings.providers.ga4.measurementId;
        grantGoogleAnalyticsConsent(measurementId);
        trackGoogleAnalyticsBrowserEvent({
          measurementId,
          eventName: event.eventName,
          eventId: event.eventId,
        });
      }

      acknowledgeBrowserTrackingEvent(event.eventId, "ga4");
    }

    function handleBrowserTrackingEvent(
      event: CustomEvent<BrowserTrackingEvent>,
    ) {
      processEvent(event.detail);
    }

    window.addEventListener(
      BROWSER_TRACKING_EVENT,
      handleBrowserTrackingEvent,
    );
    getPendingBrowserTrackingEvents("ga4").forEach(processEvent);

    return () => {
      window.removeEventListener(
        BROWSER_TRACKING_EVENT,
        handleBrowserTrackingEvent,
      );
    };
  }, [configuration, consent]);

  return null;
}

function createSettings(
  configuration: PublicTrackingResponse,
): TrackingSettings {
  return {
    version: configuration.version,
    providers: configuration.providers,
    events: configuration.events,
  };
}

function getTrackingScope(pathname: string): TrackingScopeId {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/app" || pathname.startsWith("/app/")) return "pm";
  return "public";
}
