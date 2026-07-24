"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

export const ADMIN_PENDING_LEADS_COUNT_EVENT =
  "lead-host:admin-pending-leads-count";

let badgeCache: { count: number; cachedAt: number } | null = null;
const BADGE_CACHE_MS = 15_000;
const BADGE_REFRESH_MS = 30_000;

export function AdminLeadNavBadge() {
  const [count, setCount] = useState(() => badgeCache?.count ?? 0);
  const supabase = useMemo(() => createPublicSupabaseClient(), []);

  useEffect(() => {
    let active = true;

    async function loadCount(force = false) {
      if (
        !force &&
        badgeCache &&
        Date.now() - badgeCache.cachedAt < BADGE_CACHE_MS
      ) {
        if (active) setCount(badgeCache.count);
        return;
      }

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) return;

      const response = await fetch("/api/admin/leads/summary", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        count?: number;
      };

      if (!response.ok) return;

      const nextCount = payload.count ?? 0;
      badgeCache = {
        count: nextCount,
        cachedAt: Date.now(),
      };
      if (active) setCount(nextCount);
    }

    function handleFocus() {
      void loadCount(true);
    }

    function handleCountUpdate(event: Event) {
      const nextCount = (event as CustomEvent<number>).detail;

      if (!Number.isFinite(nextCount)) return;

      badgeCache = {
        count: nextCount,
        cachedAt: Date.now(),
      };
      if (active) setCount(nextCount);
    }

    void loadCount();
    const refreshInterval = window.setInterval(
      () => void loadCount(true),
      BADGE_REFRESH_MS,
    );
    window.addEventListener("focus", handleFocus);
    window.addEventListener(
      ADMIN_PENDING_LEADS_COUNT_EVENT,
      handleCountUpdate,
    );

    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(
        ADMIN_PENDING_LEADS_COUNT_EVENT,
        handleCountUpdate,
      );
    };
  }, [supabase]);

  if (!count) return null;

  return (
    <span className="ml-auto inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
