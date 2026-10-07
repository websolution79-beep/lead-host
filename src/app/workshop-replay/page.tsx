import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";
import { WorkshopReplayLeadTracker } from "@/components/workshop-replay-tracking";
import { WorkshopReplayOffer } from "@/components/workshop-replay-offer";

export const metadata: Metadata = {
  title: "Guarda il Workshop Lead Host | Registrazione gratuita",
  description:
    "Guarda la registrazione del workshop Lead Host dedicato all'acquisizione di nuovi immobili per Property Manager.",
  robots: { index: false, follow: false },
};

export default function WorkshopReplayPage() {
  return (
    <main className="min-h-screen bg-white text-ink">
      <WorkshopReplayLeadTracker />
      <header className="border-b border-slate-200 px-5 py-4 sm:px-8 sm:py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <BrandLogo href="/workshop-accesso" />
          <span className="text-xs font-bold uppercase text-green sm:text-sm">Workshop Replay</span>
        </div>
      </header>

      <section aria-labelledby="replay-title" className="px-5 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-12">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase text-green">La registrazione è pronta</p>
            <h1 id="replay-title" className="mt-4 text-balance text-[30px] font-extrabold leading-[1.13] sm:text-[42px]">
              Guarda fino alla fine: c&apos;è una <span className="text-green">sorpresa esclusiva</span> per te
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              Scopri 8 metodi per acquisire nuovi immobili e costruire un sistema che genera opportunità per la tua attività.
            </p>
          </div>

          <div className="mt-8 aspect-video overflow-hidden rounded-lg bg-ink shadow-[0_18px_48px_rgba(15,23,42,0.16)] sm:mt-10">
            <iframe
              src="https://player.vimeo.com/video/1233525850?badge=0&autopause=0&player_id=0&app_id=58479"
              title="Workshop Lead Host: 8 metodi per acquisire nuovi immobili"
              className="h-full w-full border-0"
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>

          <WorkshopReplayOffer />
        </div>
      </section>
    </main>
  );
}
