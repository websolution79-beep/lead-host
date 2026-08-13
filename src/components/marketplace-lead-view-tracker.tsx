"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

export function MarketplaceLeadViewTracker({
  leadId,
  initialViewCount,
}: {
  leadId: string;
  initialViewCount: number;
}) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const tracked = useRef(false);
  const [viewCount, setViewCount] = useState(initialViewCount);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

    async function recordView() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) return;

      const response = await fetch(`/api/marketplace/leads/${leadId}/view`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (!response.ok) return;

      const result = (await response.json()) as { viewCount?: number };

      if (typeof result.viewCount === "number") {
        setViewCount(result.viewCount);
      }
    }

    void recordView();
  }, [leadId, supabase]);

  if (viewCount < 2) return null;

  return (
    <p className="flex items-center gap-2 text-sm font-semibold text-amber-700">
      <Eye size={17} aria-hidden="true" />
      <span>Osservato da {viewCount} Property Manager</span>
    </p>
  );
}
