import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";
import { WorkshopReplayLeadTracker } from "@/components/workshop-replay-tracking";

export const metadata: Metadata = {
  title: "Registrazione Workshop Lead Host",
  description: "La registrazione del workshop Lead Host per Property Manager.",
  robots: { index: false, follow: false },
};

export default function WorkshopReplayPage() {
  return (
    <main className="min-h-screen bg-white px-5 text-ink sm:px-8">
      <WorkshopReplayLeadTracker />
      <header className="mx-auto max-w-5xl py-5"><BrandLogo href="/workshop-accesso" /></header>
      <section className="mx-auto max-w-3xl py-16 text-center sm:py-24">
        <p className="text-sm font-bold uppercase text-green">Workshop Replay</p>
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">La registrazione sarà disponibile qui</h1>
        <p className="mt-4 text-base leading-7 text-muted">
          Stiamo preparando la pagina video. L&apos;accesso sarà pronto quando verrà aggiunta la registrazione del workshop.
        </p>
      </section>
    </main>
  );
}
