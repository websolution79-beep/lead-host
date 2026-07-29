"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import type {
  AnalyticsRangeKey,
  BusinessAnalyticsPayload,
} from "@/lib/admin/business-analytics";

export function useBusinessAnalytics({
  range,
  customFrom,
  customTo,
}: {
  range: AnalyticsRangeKey;
  customFrom?: string;
  customTo?: string;
}) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [payload, setPayload] = useState<BusinessAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError("");

      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;

        if (!token) {
          throw new Error("Sessione admin non trovata.");
        }

        const query = new URLSearchParams({ range });
        if (range === "custom" && customFrom && customTo) {
          query.set("from", customFrom);
          query.set("to", customTo);
        }
        const response = await fetch(`/api/admin/analytics?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = (await response.json()) as BusinessAnalyticsPayload;

        if (!response.ok) {
          throw new Error(
            result.error ?? "Non sono riuscito a caricare gli analytics.",
          );
        }

        setPayload(result);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Dati analytics non disponibili.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [customFrom, customTo, range, supabase],
  );

  useEffect(() => {
    if (range === "custom" && (!customFrom || !customTo)) return;

    const timeoutId = window.setTimeout(() => void load(), 0);

    return () => window.clearTimeout(timeoutId);
  }, [customFrom, customTo, load, range]);

  return {
    payload,
    loading,
    refreshing,
    error,
    reload: () => load({ silent: true }),
  };
}
