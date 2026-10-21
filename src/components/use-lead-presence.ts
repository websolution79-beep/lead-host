"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { getLeadAccessToken } from "@/lib/auth/lead-access-token";
import { useAppSession } from "@/components/app-session-provider";
import { activeLeadViewers, LEAD_PRESENCE_HEARTBEAT_MS, type LeadPresenceSnapshot } from "@/lib/admin/lead-presence";

export function useLeadPresence(ownerRequestId: string) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const { userId } = useAppSession();
  const [state, setState] = useState<{ snapshot: LeadPresenceSnapshot | null; receivedAt: number; unavailable: boolean; requestId: string }>(() => ({ snapshot: null, receivedAt: 0, unavailable: false, requestId: ownerRequestId }));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    let suspended = false;
    let sessionId = crypto.randomUUID();
    let token: string | null = null;
    let pending: AbortController | null = null;
    let inactive = false;
    const endpoint = "/api/admin/leads/presence";

    function release() {
      pending?.abort();
      pending = null;
      if (!token) return;
      void fetch(endpoint, { method: "POST", keepalive: true,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ownerRequestId, sessionId, action: "release" }),
      }).catch(() => {});
    }
    async function refresh() {
      if (!alive || suspended || inactive || pending) return;
      const controller = new AbortController();
      pending = controller;
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      try {
        const accessToken = await getLeadAccessToken(supabase, userId);
        if (!alive || suspended || controller.signal.aborted) return;
        token = accessToken;
        if (!token) throw new Error("Session unavailable");
        const response = await fetch(endpoint, { method: "POST", cache: "no-store", signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ownerRequestId, sessionId, action: "heartbeat" }),
        });
        if (!response.ok) throw new Error("Presence unavailable");
        const snapshot = await response.json() as LeadPresenceSnapshot;
        if (!Array.isArray(snapshot.participants) || !Number.isFinite(Date.parse(snapshot.serverNow))) throw new Error("Invalid presence");
        if (!alive || suspended || controller.signal.aborted) return;
        inactive = snapshot.status === "inactive";
        const receivedAt = Date.now();
        setState({ snapshot, receivedAt, unavailable: false, requestId: ownerRequestId });
        setNow(receivedAt);
      } catch {
        if (alive && !suspended && pending === controller) setState((current) => ({ ...current, unavailable: true, requestId: ownerRequestId,
          snapshot: current.requestId === ownerRequestId ? current.snapshot : null }));
      } finally {
        window.clearTimeout(timeout);
        if (pending === controller) pending = null;
      }
    }
    const pageHide = () => { suspended = true; release(); };
    const pageShow = () => { if (suspended) { suspended = false; sessionId = crypto.randomUUID(); void refresh(); } };
    const focus = () => { if (!document.hidden) void refresh(); };
    const initial = window.setTimeout(() => void refresh(), 0);
    const heartbeat = window.setInterval(() => void refresh(), LEAD_PRESENCE_HEARTBEAT_MS);
    const expiry = window.setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      alive = false;
      window.clearTimeout(initial);
      window.clearInterval(heartbeat);
      window.clearInterval(expiry);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("pageshow", pageShow);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      release();
    };
  }, [ownerRequestId, supabase, userId]);

  const current = state.requestId === ownerRequestId;
  return {
    participants: activeLeadViewers(current ? state.snapshot : null, state.receivedAt, now),
    unavailable: current && state.unavailable,
    loading: !current || (!state.snapshot && !state.unavailable),
  };
}
