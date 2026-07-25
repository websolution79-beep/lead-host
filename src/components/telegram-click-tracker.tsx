"use client";

import { useEffect } from "react";
import { dispatchBrowserTrackingEvent } from "@/lib/tracking/browser-events";

export function TelegramClickTracker() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target =
        event.target instanceof Element ? event.target.closest("a[href]") : null;

      if (!(target instanceof HTMLAnchorElement)) return;

      try {
        const url = new URL(target.href, window.location.href);
        if (!isTelegramUrl(url)) return;

        dispatchBrowserTrackingEvent("telegram_join_click");
      } catch {
        return;
      }
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}

function isTelegramUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();
  return hostname === "t.me" || hostname === "telegram.me";
}
