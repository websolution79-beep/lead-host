"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  initializeHotjar,
  isHotjarLoaded,
  setHotjarContentSuppression,
  trackHotjarBrowserEvent,
  trackHotjarStateChange,
} from "@/lib/tracking/hotjar";
import { useTrackingConsent } from "@/lib/tracking/use-tracking-consent";

type PublicTrackingResponse = {
  version: 1;
  storageReady: boolean;
  providers: TrackingSettings["providers"];
  events: TrackingSettings["events"];
};

export function HotjarTracker() {
  const pathname = usePathname();
  const consent = useTrackingConsent();
  const [configuration, setConfiguration] =
    useState<PublicTrackingResponse | null>(null);
  const previousTrackedPath = useRef<string | null>(null);
  const previousMeasurementConsent = useRef<boolean | null>(null);
  const scope = useMemo(() => getTrackingScope(pathname), [pathname]);
  const suppressPageContent = scope !== "public";

  useEffect(() => {
    if (!consent.resolved) return;

    const previous = previousMeasurementConsent.current;
    previousMeasurementConsent.current = consent.measurement;

    if (previous === true && !consent.measurement && isHotjarLoaded()) {
      window.location.reload();
    }
  }, [consent.measurement, consent.resolved]);

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
          setHotjarContentSuppression(suppressPageContent);
        }
      }
    }

    void loadConfiguration();
    return () => controller.abort();
  }, [suppressPageContent]);

  useEffect(() => {
    setHotjarContentSuppression(suppressPageContent);

    if (!configuration?.storageReady) return;

    const settings = createSettings(configuration);
    const canTrack = canActivateTrackingProvider({
      settings,
      providerId: "hotjar",
      scope,
      consent,
    });

    if (!canTrack) return;

    const siteId = settings.providers.hotjar.siteId;
    initializeHotjar({ siteId, suppressPageContent });

    const pageViewSettings = settings.events.page_view;
    if (
      pageViewSettings.enabled &&
      pageViewSettings.providers.includes("hotjar")
    ) {
      if (
        previousTrackedPath.current &&
        previousTrackedPath.current !== pathname
      ) {
        trackHotjarStateChange({
          siteId,
          pagePath: pathname,
          suppressPageContent,
        });
      }
      previousTrackedPath.current = pathname;
    }
  }, [configuration, consent, pathname, scope, suppressPageContent]);

  useEffect(() => {
    function processEvent(event: BrowserTrackingEvent) {
      if (!configuration) return;

      if (!configuration.storageReady || !consent.resolved) {
        if (!configuration.storageReady) {
          acknowledgeBrowserTrackingEvent(event.eventId, "hotjar");
        }
        return;
      }

      const settings = createSettings(configuration);
      const eventSettings = settings.events[event.eventName];
      const eventScope = getTrackingScope(event.pagePath);
      const suppressEventPageContent = eventScope !== "public";
      const canTrack =
        event.consentAtDispatch.resolved &&
        event.consentAtDispatch.measurement &&
        eventSettings.enabled &&
        eventSettings.providers.includes("hotjar") &&
        canActivateTrackingProvider({
          settings,
          providerId: "hotjar",
          scope: eventScope,
          consent,
        });

      if (canTrack) {
        trackHotjarBrowserEvent({
          siteId: settings.providers.hotjar.siteId,
          eventName: event.eventName,
          eventId: event.eventId,
          suppressPageContent: suppressEventPageContent,
        });
      }

      acknowledgeBrowserTrackingEvent(event.eventId, "hotjar");
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
    getPendingBrowserTrackingEvents("hotjar").forEach(processEvent);

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
