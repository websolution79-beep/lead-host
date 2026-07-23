"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type SupportNavBadgeProps = {
  section: "pm" | "admin";
};

const badgeCache = new Map<
  SupportNavBadgeProps["section"],
  { count: number; cachedAt: number }
>();
const BADGE_CACHE_MS = 15_000;

export function SupportNavBadge({ section }: SupportNavBadgeProps) {
  const [count, setCount] = useState(
    () => badgeCache.get(section)?.count ?? 0,
  );
  const supabase = useMemo(() => createPublicSupabaseClient(), []);

  useEffect(() => {
    let active = true;

    async function loadCount() {
      const cached = badgeCache.get(section);

      if (cached && Date.now() - cached.cachedAt < BADGE_CACHE_MS) {
        if (active) setCount(cached.count);
        return;
      }

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) return;

      const response = await fetch(
        section === "admin"
          ? "/api/admin/reports/summary"
          : "/api/support/reports/summary",
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { count?: number };

      if (response.ok) {
        const nextCount = payload.count ?? 0;
        badgeCache.set(section, {
          count: nextCount,
          cachedAt: Date.now(),
        });
        if (active) setCount(nextCount);
      }
    }

    void loadCount();

    return () => {
      active = false;
    };
  }, [section, supabase]);

  if (!count) return null;

  return (
    <span className="ml-auto inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
