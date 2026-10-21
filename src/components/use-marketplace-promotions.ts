"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketplacePromotionsSnapshot } from "@/lib/team-compensation/marketplace-promotion-types";

export function useMarketplacePromotions(leadIds: string[], active: boolean, getToken: () => Promise<string | null>) {
  const key = active ? [...new Set(leadIds)].sort().join(",") : "";
  const generation = useRef(0);
  const [data, setData] = useState<{ key: string; snapshot: MarketplacePromotionsSnapshot } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [readError, setReadError] = useState("");
  const [clock, setClock] = useState(Date.now);
  const [offset, setOffset] = useState(0);
  const activeKey = useRef("");
  const busy = useRef(new Set<string>());

  const load = useCallback(async (signal?: AbortSignal) => {
    if (key !== activeKey.current) return;
    const version = ++generation.current;
    if (!key) return;
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessione non disponibile.");
      const response = await fetch(`/api/admin/leads/promotions?leadIds=${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
      });
      const payload = await response.json() as MarketplacePromotionsSnapshot & { error?: string };
      if (!response.ok || !Array.isArray(payload.promotions)) throw new Error(payload.error ?? "Promozioni non disponibili.");
      if (signal?.aborted || version !== generation.current) return;
      setOffset(Date.parse(payload.serverNow) - Date.now());
      setClock(Date.now());
      setData({ key, snapshot: payload });
      setReadError("");
    } catch (cause) {
      if (signal?.aborted || version !== generation.current) return;
      setData({ key, snapshot: {
        storageReady: false, engineReady: false, enabled: false, canManageAll: false,
        serverNow: new Date().toISOString(), candidates: [], promotions: [],
      } });
      setReadError(cause instanceof Error ? cause.message : "Promozioni non disponibili.");
    }
  }, [getToken, key]);

  useEffect(() => {
    const controller = new AbortController();
    generation.current++;
    activeKey.current = key;
    if (key) void load(controller.signal);
    const onFocus = () => { if (key && !document.hidden) void load(controller.signal); };
    window.addEventListener("focus", onFocus);
    return () => { controller.abort(); window.removeEventListener("focus", onFocus); };
  }, [key, load]);

  useEffect(() => {
    if (!key) return;
    const interval = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, [key]);

  const change = useCallback(async (leadId: string, revision: string, action: "claim" | "release", memberId?: string) => {
    if (busy.current.has(leadId)) return;
    busy.current.add(leadId);
    setPending((current) => ({ ...current, [leadId]: true }));
    setErrors((current) => ({ ...current, [leadId]: "" }));
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessione non disponibile.");
      const response = await fetch("/api/admin/leads/promotions", {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, expectedRevision: revision, action, ...(memberId ? { memberId } : {}) }),
      });
      const payload = await response.json() as { error?: string };
      // Refresh only promotion metadata, not the entire lead list.
      if (response.ok || response.status === 409) void load();
      if (!response.ok) throw new Error(payload.error ?? "Promozione non aggiornata.");
    } catch (cause) {
      setErrors((current) => ({ ...current, [leadId]: cause instanceof Error ? cause.message : "Promozione non aggiornata." }));
    } finally {
      busy.current.delete(leadId);
      setPending((current) => ({ ...current, [leadId]: false }));
    }
  }, [getToken, load]);

  return {
    snapshot: data?.key === key ? data.snapshot : null,
    errors, pending, readError, now: clock + offset, change,
    refresh: () => void load(),
  };
}
