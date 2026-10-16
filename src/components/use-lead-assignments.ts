"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LeadAssignmentsSnapshot } from "@/lib/admin/lead-assignment-types";

export function useLeadAssignments(getToken: () => Promise<string | null>) {
  const [snapshot, setSnapshot] = useState<LeadAssignmentsSnapshot | null>(null);
  const [readError, setReadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    try {
      const token = await getToken();
      if (request.signal.aborted) return;
      if (!token) throw new Error("Sessione non disponibile per le prese in carico.");
      const response = await fetch("/api/admin/leads/assignments", {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: request.signal,
      });
      const payload = await response.json();
      if (request.signal.aborted || !mounted.current) return;
      if (!response.ok) throw new Error(payload.error ?? "Prese in carico non disponibili.");
      setSnapshot(payload as LeadAssignmentsSnapshot);
      setFresh(true);
      setReadError("");
    } catch (cause) {
      if (request.signal.aborted || !mounted.current) return;
      setFresh(false);
      setReadError(cause instanceof Error ? cause.message : "Aggiornamento prese in carico non riuscito.");
    }
  }, [getToken]);

  useEffect(() => {
    mounted.current = true;
    const update = () => { if (!document.hidden && !saving.current) void refresh(); };
    const initial = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 15000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      mounted.current = false;
      controller.current?.abort();
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);

  async function assign(ownerRequestId: string, assigneeProfileId: string | null, expectedRevision: string) {
    if (saving.current || !fresh) return;
    saving.current = true;
    controller.current?.abort();
    setSavingId(ownerRequestId);
    setActionError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessione non disponibile.");
      const response = await fetch("/api/admin/leads/assignments", {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ownerRequestId, assigneeProfileId, expectedRevision }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Presa in carico non aggiornata.");
    } catch (cause) {
      if (mounted.current) setActionError(cause instanceof Error ? cause.message : "Presa in carico non aggiornata.");
    } finally {
      // Conflicts refresh the visible owner, never silently retry the claim.
      if (mounted.current) {
        await refresh();
        setSavingId(null);
      }
      saving.current = false;
    }
  }

  return { snapshot, error: actionError || readError, savingId, fresh, assign };
}
