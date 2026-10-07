"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";

const bookingUrl = "https://calendly.com/lead-host/30min";
const openedAtKey = "leadhost:workshop-replay:opened-at";
const revealDelayMs = 27 * 60 * 1000;

export function WorkshopReplayOffer() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const now = Date.now();
    let openedAt = now;

    try {
      const stored = Number(sessionStorage.getItem(openedAtKey));
      if (stored > 0 && stored <= now) {
        openedAt = stored;
      } else {
        sessionStorage.setItem(openedAtKey, String(now));
      }
    } catch {
      // Storage restrictions should not prevent the offer from appearing.
    }

    const remaining = Math.max(0, revealDelayMs - (now - openedAt));
    const timer = window.setTimeout(() => setIsVisible(true), remaining);
    return () => window.clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  return (
    <>
      <section aria-labelledby="replay-offer-title" className="mx-auto mt-10 max-w-4xl border-t-4 border-green bg-mint/40 px-5 py-8 text-center sm:mt-12 sm:px-10 sm:py-10">
        <p className="text-sm font-bold uppercase text-green">Solo per chi guarda il workshop</p>
        <h2 id="replay-offer-title" className="mx-auto mt-3 max-w-3xl text-balance text-2xl font-extrabold leading-tight sm:text-3xl">
          Scopri come avere il Tuo Sistema Proprietario che Genera nuovi contatti di proprietari per te anche mentre dormi
        </h2>
        <a
          href={bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary mx-auto mt-6 inline-flex min-h-12 w-full max-w-md items-center justify-center gap-2 text-center"
        >
          Prenota la tua chiamata Gratuita <ArrowUpRight aria-hidden="true" size={19} />
        </a>
      </section>

      <aside aria-label="Prenota la tua chiamata gratuita" className="fixed inset-x-0 bottom-0 z-40 border-t border-green/20 bg-white/95 pb-[max(12px,env(safe-area-inset-bottom))] pl-4 pr-16 pt-3 shadow-[0_-10px_35px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:gap-5 sm:text-left">
          <p className="text-sm font-bold leading-5 sm:text-base">Il tuo sistema di acquisizione parte da qui</p>
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 text-center sm:w-auto"
          >
            Prenota la tua chiamata Gratuita <ArrowUpRight aria-hidden="true" size={18} />
          </a>
        </div>
      </aside>
      <div aria-hidden="true" className="h-28 sm:h-20" />
    </>
  );
}
