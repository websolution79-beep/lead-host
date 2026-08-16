"use client";

import { useEffect, useMemo } from "react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;

export function PrimeLifecycleHeartbeat() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);

  useEffect(() => {
    let active = true;

    async function runLifecycleCheck() {
      if (!active || document.visibilityState === "hidden") return;

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token || !active) return;

      await fetch("/api/prime/lifecycle", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }).catch(() => null);
    }

    const initialCheck = window.setTimeout(() => void runLifecycleCheck(), 1500);
    const interval = window.setInterval(
      () => void runLifecycleCheck(),
      CHECK_INTERVAL_MS,
    );

    return () => {
      active = false;
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
    };
  }, [supabase]);

  return null;
}
