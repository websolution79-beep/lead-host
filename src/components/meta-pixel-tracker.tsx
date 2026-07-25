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
  grantMetaPixelConsent,
  revokeMetaPixelConsent,
  trackMetaBrowserEvent,
  trackMetaPageView,
} from "@/lib/tracking/meta-pixel";
import { useTrackingConsent } from "@/lib/tracking/use-tracking-consent";

type PublicTrackingResponse = {
  version: 1;
  storageReady: boolean;
  providers: TrackingSettings["providers"];
  events: TrackingSettings["events"];
};

export function MetaPixelTracker() {
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
        const payload = (await response.json()) as PublicTrackingResponse;
        setConfiguration(payload);
      } catch (error) {
        if (
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          revokeMetaPixelConsent();
        }
      }
    }

    void loadConfiguration();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!configuration?.storageReady) {
      revokeMetaPixelConsent();
      return;
    }

    const settings: TrackingSettings = {
      version: configuration.version,
      providers: configuration.providers,
      events: configuration.events,
    };
    const pageView = settings.events.page_view;
    const pageViewEnabled =
      pageView?.enabled === true && pageView.providers.includes("meta");
    const metaAllowed =
      pageViewEnabled &&
      canActivateTrackingProvider({
        settings,
        providerId: "meta",
        scope,
        consent,
      });

    if (!metaAllowed) {
      revokeMetaPixelConsent();
      return;
    }

    const pixelId = settings.providers.meta.pixelId;
    grantMetaPixelConsent(pixelId);
    trackMetaPageView({
      pixelId,
      pageKey: `${scope}:${pathname}`,
    });
  }, [configuration, consent, pathname, scope]);

  useEffect(() => {
    function processEvent(event: BrowserTrackingEvent) {
      if (!configuration) return;

      if (!configuration.storageReady || !consent.resolved) {
        if (!configuration.storageReady) {
          acknowledgeBrowserTrackingEvent(event.eventId);
        }
        return;
      }

      const settings: TrackingSettings = {
        version: configuration.version,
        providers: configuration.providers,
        events: configuration.events,
      };
      const eventSettings = settings.events[event.eventName];
      const eventScope = getTrackingScope(event.pagePath);
      const canTrack =
        event.consentAtDispatch.resolved &&
        event.consentAtDispatch.marketing &&
        eventSettings.enabled &&
        eventSettings.providers.includes("meta") &&
        canActivateTrackingProvider({
          settings,
          providerId: "meta",
          scope: eventScope,
          consent,
        });

      if (canTrack) {
        const pixelId = settings.providers.meta.pixelId;
        grantMetaPixelConsent(pixelId);
        trackMetaBrowserEvent({
          pixelId,
          eventName: event.eventName,
          eventId: event.eventId,
        });
      }

      acknowledgeBrowserTrackingEvent(event.eventId);
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
    getPendingBrowserTrackingEvents().forEach(processEvent);

    return () => {
      window.removeEventListener(
        BROWSER_TRACKING_EVENT,
        handleBrowserTrackingEvent,
      );
    };
  }, [configuration, consent]);

  return null;
}

function getTrackingScope(pathname: string): TrackingScopeId {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/app" || pathname.startsWith("/app/")) return "pm";
  return "public";
}
