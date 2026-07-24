"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LockKeyhole, UnlockKeyhole, Users } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type RegistrationSettingsResponse = {
  settings?: {
    open: boolean;
  };
  storageReady?: boolean;
  error?: string;
};

export function AdminPmRegistrationSettings() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storageReady, setStorageReady] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadSettings = useCallback(async () => {
    const token = await getAccessToken();

    setLoading(true);
    setError("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/settings/pm-registration", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as RegistrationSettingsResponse;

    if (!response.ok || !payload.settings) {
      setError(payload.error ?? "Non riesco a caricare lo stato delle iscrizioni.");
      setLoading(false);
      return;
    }

    setIsOpen(payload.settings.open);
    setStorageReady(payload.storageReady ?? true);
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadSettings(), 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadSettings]);

  async function changeStatus(nextOpen: boolean) {
    if (nextOpen === isOpen) return;

    const token = await getAccessToken();
    setSaving(true);
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/admin/settings/pm-registration", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ open: nextOpen }),
    });
    const payload = (await response.json()) as RegistrationSettingsResponse;

    if (!response.ok || !payload.settings) {
      setError(payload.error ?? "Non sono riuscito ad aggiornare le iscrizioni.");
      setSaving(false);
      return;
    }

    setIsOpen(payload.settings.open);
    setSuccess(
      payload.settings.open
        ? "Iscrizioni Property Manager aperte."
        : "Iscrizioni Property Manager chiuse.",
    );
    setSaving(false);
  }

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${
              isOpen ? "bg-green/10 text-green" : "bg-red-50 text-red-700"
            }`}
          >
            <Users size={22} />
          </span>
          <div>
            <p className="section-kicker">Accesso alla piattaforma</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Iscrizioni Property Manager
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Questa impostazione blocca solo la creazione di nuovi account PM.
              Gli utenti già registrati possono continuare ad accedere normalmente.
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${
            isOpen ? "bg-green/10 text-green" : "bg-red-50 text-red-700"
          }`}
        >
          {isOpen ? <UnlockKeyhole size={16} /> : <LockKeyhole size={16} />}
          {loading ? "Verifica..." : isOpen ? "Aperte" : "Chiuse"}
        </span>
      </div>

      <div className="mt-6 grid gap-2 rounded-lg bg-slate-100 p-1 sm:grid-cols-2">
        <button
          className={`flex min-h-12 items-center justify-center gap-2 rounded-lg text-sm font-bold transition ${
            isOpen
              ? "bg-green text-white shadow-sm"
              : "bg-transparent text-slate-600 hover:bg-white"
          }`}
          type="button"
          disabled={loading || saving}
          onClick={() => void changeStatus(true)}
        >
          <UnlockKeyhole size={17} />
          Aperte
        </button>
        <button
          className={`flex min-h-12 items-center justify-center gap-2 rounded-lg text-sm font-bold transition ${
            !isOpen
              ? "bg-red-600 text-white shadow-sm"
              : "bg-transparent text-slate-600 hover:bg-white"
          }`}
          type="button"
          disabled={loading || saving}
          onClick={() => void changeStatus(false)}
        >
          <LockKeyhole size={17} />
          {saving ? "Salvataggio..." : "Chiuse"}
        </button>
      </div>

      {!storageReady ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          La tabella delle impostazioni non è disponibile.
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-lg border border-green/20 bg-green/10 p-3 text-sm font-semibold text-green">
          {success}
        </p>
      ) : null}
    </section>
  );
}
