"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Send, X } from "lucide-react";
import { useAppSession } from "@/components/app-session-provider";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

const TELEGRAM_CHANNEL_URL = "https://t.me/+nZiF2verYaUzNzg0";

export function TelegramOpportunityPrompt() {
  const session = useAppSession();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingPreference, setSavingPreference] = useState(false);
  const [error, setError] = useState("");
  const isPropertyManager = session.roles.includes("property_manager");
  const sessionKey = `leadhost:telegram-prompt:closed:${session.userId}`;

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const closeForSession = useCallback(() => {
    try {
      window.sessionStorage.setItem(sessionKey, "1");
    } catch {
      // The prompt can still close when browser storage is unavailable.
    }
    setVisible(false);
  }, [sessionKey]);

  useEffect(() => {
    if (!isPropertyManager) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPreference() {
      try {
        if (window.sessionStorage.getItem(sessionKey) === "1") {
          setLoading(false);
          return;
        }
      } catch {
        // Continue without session storage.
      }

      const token = await getToken();
      if (!token || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/telegram-prompt-preference", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;

        const payload = (await response.json()) as { dismissedAt?: string | null };
        if (!payload.dismissedAt) setVisible(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPreference();
    return () => {
      cancelled = true;
    };
  }, [getToken, isPropertyManager, sessionKey]);

  useEffect(() => {
    if (!visible) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeForSession();
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeForSession, visible]);

  async function dismissForever() {
    const token = await getToken();
    if (!token) {
      setError("Sessione non disponibile. Riprova tra poco.");
      return;
    }

    setSavingPreference(true);
    setError("");
    const response = await fetch("/api/telegram-prompt-preference", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dismissed: true }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Non riesco a salvare la preferenza.");
      setSavingPreference(false);
      return;
    }

    closeForSession();
  }

  if (loading || !visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end bg-slate-950/45 p-3 sm:items-center sm:justify-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeForSession();
      }}
    >
      <section
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="telegram-prompt-title"
      >
        <button
          className="absolute right-3 top-3 inline-flex size-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-ink focus:outline-none focus:ring-2 focus:ring-[#229ED9] focus:ring-offset-2"
          type="button"
          aria-label="Chiudi avviso Telegram"
          title="Chiudi"
          onClick={closeForSession}
        >
          <X size={21} />
        </button>

        <div className="p-5 sm:p-8">
          <span className="flex size-12 items-center justify-center rounded-xl bg-[#229ED9]/10 text-[#229ED9]">
            <BellRing size={25} />
          </span>
          <h2 id="telegram-prompt-title" className="mt-5 pr-9 text-2xl font-semibold text-ink sm:text-3xl">
            Non perdere le nuove opportunità
          </h2>
          <p className="mt-4 text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
            Le opportunità su Lead Host sono limitate: quando un Property Manager acquista un Lead in esclusiva, questo non è più disponibile per gli altri.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
            Entra nel nostro canale Telegram per ricevere una notifica ogni volta che pubblichiamo un nuovo immobile, senza dover controllare continuamente il Marketplace.
          </p>

          <a
            className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-[#229ED9] px-5 text-center text-sm font-bold text-white shadow-sm transition hover:bg-[#1B8DC7] focus:outline-none focus:ring-2 focus:ring-[#229ED9] focus:ring-offset-2 sm:text-base"
            href={TELEGRAM_CHANNEL_URL}
            target="_blank"
            rel="noreferrer"
            onClick={closeForSession}
          >
            <Send aria-hidden="true" size={19} />
            ATTIVA GLI AVVISI SU TELEGRAM
          </a>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700">
            <input
              className="mt-0.5 size-4 shrink-0 accent-[#229ED9]"
              type="checkbox"
              disabled={savingPreference}
              onChange={(event) => {
                if (event.target.checked) void dismissForever();
              }}
            />
            <span>
              Non mostrare più questo messaggio
              {savingPreference ? <span className="block text-xs font-normal text-muted">Salvataggio preferenza...</span> : null}
            </span>
          </label>
          {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}
