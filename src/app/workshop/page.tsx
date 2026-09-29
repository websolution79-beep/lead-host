import type { Metadata } from "next";
import { CalendarDays, Check, MapPin } from "lucide-react";
import { PublicNav } from "@/components/public-nav";
import { WorkshopCommunityLink } from "@/components/workshop-community-link";

export const metadata: Metadata = {
  title: { absolute: "Lead Host Live | Workshop per Property Manager" },
  description:
    "Partecipa al Lead Host Live del 6 ottobre e scopri come creare un sistema per acquisire nuovi immobili da gestire.",
  alternates: { canonical: "/workshop" },
  openGraph: {
    title: "Lead Host Live | Workshop per Property Manager",
    description:
      "Live gratuita per Property Manager. 6 ottobre 2026, ore 21:00. Entra nella Community WhatsApp per partecipare.",
    url: "/workshop",
    type: "website",
  },
};

const benefits = [
  "Genera nuove opportunità di acquisizione",
  "Crea un sistema che lavora anche quando tu non stai lavorando",
  "Mantieni il controllo di lead, campagne e budget",
];

export default function WorkshopPage() {
  return (
    <main className="bg-white text-ink">
      <div className="mx-auto max-w-6xl px-5 pb-3 pt-3 sm:px-8 sm:py-5">
        <PublicNav />
      </div>

      <section aria-labelledby="workshop-title" className="px-5 pb-7 pt-4 sm:px-8 sm:pb-12 sm:pt-8">
        <div className="mx-auto max-w-4xl sm:text-center">
          <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase leading-5 text-green sm:text-xs">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-red-500" />
            Live gratuita per Property Manager
          </p>
          <h1 id="workshop-title" className="mt-3 text-2xl font-semibold uppercase leading-[1.15] sm:mt-5 sm:text-4xl lg:text-[42px]">
            Scopri come creare un sistema che lavora per acquisire nuovi immobili, <span className="text-green">anche mentre dormi</span>
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted sm:mx-auto sm:mt-5 sm:max-w-3xl sm:text-lg sm:leading-7">
            Il 6 ottobre scopri come creare e gestire un tuo sistema per generare nuove opportunità di proprietari, senza dipendere da agenzie di marketing.
          </p>

          <div className="mt-4 grid gap-2 sm:mt-6 sm:justify-items-center">
            <p className="flex items-center gap-2 text-sm font-bold uppercase text-ink sm:text-base">
              <CalendarDays aria-hidden="true" className="shrink-0 text-green" size={18} />
              <time dateTime="2026-10-06T21:00:00+02:00">6 ottobre 2026 · Ore 21:00</time>
            </p>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted">
              <MapPin aria-hidden="true" size={15} /> Evento online
            </p>
          </div>

          <div className="mt-5 sm:mt-6">
            <WorkshopCommunityLink>Entra nella Community WhatsApp</WorkshopCommunityLink>
            <p className="mt-2 text-xs leading-5 text-muted">
              Riceverai nella Community il link per partecipare alla LIVE.
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Cosa otterrai dalla live" className="border-t border-slate-200 bg-paper px-5 py-6 sm:px-8 sm:py-9">
        <div className="mx-auto max-w-4xl">
          <ul className="grid gap-3 sm:grid-cols-3 sm:gap-6">
            {benefits.map((benefit) => (
              <li className="flex items-start gap-2 text-sm font-semibold leading-6" key={benefit}>
                <Check aria-hidden="true" className="mt-1 shrink-0 text-green" size={18} strokeWidth={3} />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 sm:text-center">
            <p className="mb-3 text-sm font-bold uppercase text-green">6 ottobre · Ore 21:00</p>
            <WorkshopCommunityLink>Partecipa alla LIVE</WorkshopCommunityLink>
          </div>
        </div>
      </section>
    </main>
  );
}
