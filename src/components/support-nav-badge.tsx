"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type SupportNavBadgeProps = {
  section: "pm" | "admin";
};

export function SupportNavBadge({ section }: SupportNavBadgeProps) {
  const [count, setCount] = useState(0);
  const supabase = useMemo(() => createPublicSupabaseClient(), []);

  useEffect(() => {
    let active = true;

    async function loadCount() {
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

      if (active && response.ok) setCount(payload.count ?? 0);
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
