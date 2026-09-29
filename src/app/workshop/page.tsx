import type { Metadata } from "next";
import Image from "next/image";
import { CalendarDays, MapPin, SlidersHorizontal, Target, Zap } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
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
    images: [{ url: "/images/workshop-acquisizione-live.webp", width: 1200, height: 800, alt: "Lead Host Live: immobili e acquisizione automatizzata" }],
    type: "website",
  },
};

const benefits = [
  { title: "Nuove opportunità", text: "Genera nuove opportunità di acquisizione", icon: Target, tone: "bg-mint text-green" },
  { title: "Un sistema sempre al lavoro", text: "Crea un sistema che lavora anche quando tu non stai lavorando", icon: Zap, tone: "bg-amber-50 text-amber-700" },
  { title: "Il controllo resta tuo", text: "Mantieni il controllo di lead, campagne e budget", icon: SlidersHorizontal, tone: "bg-blue-50 text-blue-700" },
];

export default function WorkshopPage() {
  return (
    <main className="bg-white text-ink">
      <header className="flex justify-center px-5 pb-2 pt-4 sm:pb-3 sm:pt-6">
        <BrandLogo href="/workshop" />
      </header>

      <section aria-labelledby="workshop-title" className="px-5 pb-6 pt-4 sm:px-8 sm:pb-9 sm:pt-7">
        <div className="mx-auto max-w-5xl text-center">
          <p className="inline-flex items-center justify-center gap-2 rounded-lg border border-green/20 bg-mint/40 px-3 py-2 text-[13px] font-bold leading-5 text-green sm:px-4 sm:text-base">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-red-500" />
            Live gratuita per Property Manager
          </p>
          <h1 id="workshop-title" className="mx-auto mt-4 max-w-[940px] text-balance text-[28px] font-extrabold leading-[1.1] sm:mt-5 sm:text-[42px] lg:text-[52px]">
            Scopri come creare un sistema che lavora per acquisire nuovi immobili, <span className="whitespace-nowrap text-green">anche mentre dormi</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-[22px] text-muted sm:mt-5 sm:text-lg sm:leading-7">
            Il 6 ottobre scopri come creare e gestire un tuo sistema per generare nuove opportunità di proprietari, senza dipendere da agenzie di marketing.
          </p>

          <div className="mt-4 grid justify-items-center gap-2 sm:mt-5">
            <p className="flex flex-wrap items-center justify-center gap-2 text-sm font-bold uppercase text-ink sm:text-base">
              <CalendarDays aria-hidden="true" className="shrink-0 text-green" size={18} />
              <time dateTime="2026-10-06T21:00:00+02:00">6 ottobre 2026 · Ore 21:00</time>
            </p>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted">
              <MapPin aria-hidden="true" size={15} /> Evento online
            </p>
          </div>

          <div className="mx-auto mt-5 max-w-md">
            <WorkshopCommunityLink>Entra nella Community WhatsApp</WorkshopCommunityLink>
            <p className="mt-2 text-xs leading-5 text-muted">
              Riceverai nella Community il link per partecipare alla LIVE.
            </p>
          </div>
        </div>
      </section>

      <figure className="mx-auto max-w-5xl">
        <Image
          src="/images/workshop-acquisizione-live.webp"
          alt="Un edificio e un sistema digitale di acquisizione immobiliare: illustrazione del tema della LIVE"
          width={1200}
          height={800}
          sizes="(max-width: 1024px) 100vw, 1024px"
          className="h-auto w-full object-cover sm:aspect-[5/2] sm:h-auto"
        />
      </figure>

      <section aria-label="Cosa otterrai dalla live" className="border-t border-slate-200 bg-paper px-5 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-5xl">
          <ul className="grid gap-4 sm:grid-cols-3 sm:gap-8">
            {benefits.map((benefit) => (
              <li className="flex items-start gap-3 sm:block sm:text-center" key={benefit.title}>
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-lg sm:mx-auto ${benefit.tone}`}>
                  <benefit.icon aria-hidden="true" size={23} strokeWidth={1.8} />
                </span>
                <div className="sm:mt-3">
                  <h2 className="text-sm font-bold leading-6 sm:text-base">{benefit.title}</h2>
                  <p className="mt-1 text-sm leading-5 text-muted">{benefit.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mx-auto mt-6 max-w-md text-center">
            <p className="mb-3 text-sm font-bold uppercase text-green">6 ottobre · Ore 21:00</p>
            <WorkshopCommunityLink>Partecipa alla LIVE</WorkshopCommunityLink>
          </div>
        </div>
      </section>
    </main>
  );
}
