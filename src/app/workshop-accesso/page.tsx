import type { Metadata } from "next";
import Image from "next/image";
import { ArrowDown } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { WorkshopOptInTracker } from "@/components/workshop-replay-tracking";
import styles from "./workshop-accesso.module.css";

const brevoFormUrl =
  "https://c73716ac.sibforms.com/v2/serve/MUIFANKfLJhbfNpi4y95WXpPmk9heBagRM1zc02ctbNBBNpdUZOdr6skjAf1CYPJk5FfOc8FEfkI0tRP9sZdUYEJtnFA4oR1T25EEIJMX_8D2-1I4l_beosu1X3FyKKez9XK_jj6rQjz_gyVxe7-vkzSMNpFqhHNVVq3dYU12cAOc3FENG1-ddwMJ1MwJ0oAexpZkaTZAGR-kpP4fQ==";

export const metadata: Metadata = {
  title: "Workshop Replay | 8 metodi per acquisire immobili",
  description:
    "Accedi gratuitamente alla registrazione del workshop Lead Host: 8 metodi per acquisire nuovi immobili e creare un sistema autonomo di acquisizione.",
  alternates: { canonical: "/workshop-accesso" },
  openGraph: {
    title: "Workshop Replay | 8 metodi per acquisire immobili",
    description:
      "Guarda la registrazione gratuita del workshop Lead Host dedicato ai Property Manager.",
    images: ["/images/workshop-replay-cover.png"],
    type: "website",
  },
};

export default function WorkshopAccessPage() {
  return (
    <main className="min-h-screen bg-white text-ink">
      <WorkshopOptInTracker />
      <header className="border-b border-slate-200 px-5 py-4 sm:px-8 sm:py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <BrandLogo href="/workshop-accesso" />
          <span className="text-xs font-bold uppercase text-green sm:text-sm">Workshop Replay</span>
        </div>
      </header>

      <section className="px-5 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-12">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-bold uppercase text-green">Registrazione gratuita per Property Manager</p>
            <h1 className="mt-4 text-balance text-[30px] font-extrabold leading-[1.13] sm:text-[42px] lg:text-[48px]">
              Scopri <span className="text-green">8 metodi</span> per acquisire nuovi immobili e come creare un <span className="text-green">SISTEMA autonomo</span> che lavora per te anche <span className="text-green">mentre dormi</span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              Guarda la registrazione del workshop Lead Host e scopri come costruire nuove opportunità di acquisizione.
            </p>
            <div className="lg:hidden">
              <a href="#accesso-video" className="btn btn-primary mx-auto mt-5 min-h-12 w-full max-w-sm justify-center">
                Accedi al video gratuito <ArrowDown aria-hidden="true" size={17} />
              </a>
            </div>
          </div>

          <div className="mt-8 grid min-w-0 gap-7 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)] lg:items-start lg:gap-9">
            <div className="min-w-0">
              <a
                href="#accesso-video"
                className="block overflow-hidden rounded-lg bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-green"
                aria-label="Vai al modulo per accedere alla registrazione gratuita"
              >
                <Image
                  src="/images/workshop-replay-cover.png"
                  alt="Copertina del workshop Lead Host: due percorsi per acquisire nuovi immobili"
                  width={1920}
                  height={1080}
                  sizes="(max-width: 1024px) 100vw, 55vw"
                  priority
                  className="h-auto w-full"
                />
              </a>
              <p className="mt-3 text-sm leading-6 text-muted">
                La registrazione completa sarà disponibile dopo l&apos;iscrizione gratuita.
              </p>
            </div>

            <section id="accesso-video" aria-labelledby="accesso-video-title" className={styles.formPanel}>
              <div className="border-b border-slate-200 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
                <p className="text-xs font-bold uppercase text-green">Accesso immediato</p>
                <h2 id="accesso-video-title" className="mt-2 text-xl font-bold leading-7 sm:text-2xl">Accedi al video gratuito</h2>
                <p className="mt-2 text-sm leading-6 text-muted">Compila il modulo per aprire la registrazione del workshop.</p>
              </div>
              <iframe
                title="Modulo Brevo per accedere alla registrazione del workshop"
                src={brevoFormUrl}
                className={styles.formIframe}
                scrolling="auto"
              />
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
