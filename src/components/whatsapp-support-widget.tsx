"use client";

import { useEffect, useState } from "react";
import { ExternalLink, MessageCircle, X } from "lucide-react";
import { usePathname } from "next/navigation";

type WhatsAppWidgetSettings = {
  enabled: boolean;
  businessNumber: string;
  prefilledMessage: string;
};

export function WhatsAppSupportWidget() {
  const pathname = usePathname();
  const [settings, setSettings] = useState<WhatsAppWidgetSettings | null>(null);
  const [open, setOpen] = useState(false);
  const assistanceHref = pathname.startsWith("/admin")
    ? "/admin/segnalazioni"
    : "/app/assistenza";

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      const response = await fetch("/api/settings/whatsapp-widget", {
        cache: "force-cache",
      });
      if (!response.ok || cancelled) return;

      const payload = (await response.json()) as {
        settings?: WhatsAppWidgetSettings;
      };
      if (payload.settings && !cancelled) setSettings(payload.settings);
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!settings?.enabled) return null;

  const whatsAppHref = `https://wa.me/${settings.businessNumber}?text=${encodeURIComponent(
    settings.prefilledMessage,
  )}`;

  return (
    <div className="fixed bottom-24 right-4 z-[80] sm:right-6">
      {open ? (
        <section
          className="absolute bottom-16 right-0 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
          role="dialog"
          aria-modal="false"
          aria-labelledby="whatsapp-support-title"
        >
          <button
            className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-ink focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2"
            type="button"
            aria-label="Chiudi assistenza WhatsApp"
            title="Chiudi"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
          <div className="p-5">
            <span className="flex size-11 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#128C3E]">
              <MessageCircle size={23} />
            </span>
            <h2 id="whatsapp-support-title" className="mt-4 pr-8 text-lg font-semibold text-ink">
              Come possiamo aiutarti?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Per assistenza su acquisti già effettuati utilizza la funzione
              Assistenza presente nella tua area riservata.
            </p>
            <a
              className="btn btn-primary mt-5 w-full justify-center"
              href={assistanceHref}
              onClick={() => setOpen(false)}
            >
              Vai all&apos;assistenza
            </a>
            <a
              className="btn btn-secondary mt-3 w-full justify-center"
              href={whatsAppHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <ExternalLink size={16} />
              Apri WhatsApp
            </a>
          </div>
        </section>
      ) : null}

      <button
        className="inline-flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30 transition hover:bg-[#1EBE5D] focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2"
        type="button"
        aria-label="Apri assistenza WhatsApp"
        aria-expanded={open}
        title="Assistenza WhatsApp"
        onClick={() => setOpen((current) => !current)}
      >
        <MessageCircle size={27} />
      </button>
    </div>
  );
}
