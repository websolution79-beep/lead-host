"use client";

import { useEffect, type ReactNode } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";
import { dispatchBrowserTrackingEvent } from "@/lib/tracking/browser-events";

const COMMUNITY_URL = "https://chat.whatsapp.com/DkYCM4dsODCEOtu2mFooe1";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export function WorkshopCommunityLink({ children }: { children: ReactNode }) {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const attribution = Object.fromEntries(
        UTM_KEYS.flatMap((key) => params.has(key) ? [[key, params.get(key)]] : []),
      );
      if (Object.keys(attribution).length) {
        sessionStorage.setItem("leadhost:workshop:attribution", JSON.stringify(attribution));
      }
    } catch {
      // Storage may be unavailable in private or restricted browsers.
    }
  }, []);

  function trackClick() {
    try {
      // The global tracker handles consent and sends Lead synchronously before navigation.
      dispatchBrowserTrackingEvent("lead");
    } catch {
      // Tracking must not prevent access to the community.
    }
  }

  return (
    <a
      href={COMMUNITY_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={trackClick}
      className="btn btn-primary min-h-14 w-full gap-2 px-3 text-center text-xs uppercase leading-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-green sm:w-auto sm:px-7 sm:text-sm"
    >
      <MessageCircle aria-hidden="true" className="shrink-0" size={20} />
      <span>{children}</span>
      <ArrowRight aria-hidden="true" className="shrink-0" size={18} />
    </a>
  );
}
