"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { dispatchBrowserTrackingEvent } from "@/lib/tracking/browser-events";

const MARKETPLACE_DETAIL_PATH =
  /^\/app\/marketplace\/[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

export function ViewContentTracker() {
  const pathname = usePathname();
  const trackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (
      trackedPath.current === pathname ||
      !MARKETPLACE_DETAIL_PATH.test(pathname)
    ) {
      return;
    }

    trackedPath.current = pathname;
    dispatchBrowserTrackingEvent("view_content");
  }, [pathname]);

  return null;
}
