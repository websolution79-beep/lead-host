import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, ShieldCheck } from "lucide-react";
import { LeadCard } from "@/components/lead-card";
import { PublicNav } from "@/components/public-nav";
import { demoLeads } from "@/lib/domain/sample-data";

const ownerSteps = [
  "Descrivi il tuo immobile",
  "Lead Host verifica la richiesta",
  "Ricevi contatti da massimo 2 Property Manager",
];

const pmBenefits = [
  "Registrazione gratuita",
  "Marketplace consultabile senza costi",
  "Paghi solo i contatti che scegli",
  "Esclusiva disponibile solo prima del primo acquisto",
];

export default function Home() {
  return (
    <main>
      <section className="relative min-h-[78svh] overflow-hidden bg-graphite text-white">
        <Image
          src="/images/lead-host-hero.png"
          alt="Interno moderno con dashboard Lead Host"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.9),rgba(15,23,42,0.62)_42%,rgba(15,23,42,0.08))]" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(180deg,transparent,rgba(247,248,250,0.96))]" />
        <div className="relative mx-auto flex min-h-[78svh] max-w-7xl flex-col px-5 py-5 sm:px-8">
          <PublicNav variant="dark" />
          <div className="flex max-w-3xl flex-1 flex-col justify-center py-14">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Marketplace per Property Manager
            </p>
            <h1 className="max-w-2xl text-5xl font-semibold leading-[1.02] text-white sm:text-7xl">
              Lead Host
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/86">
              Trasforma richieste di proprietari in opportunita qualificate,
              acquistabili in modo semplice, protetto e tracciabile.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link className="btn btn-primary" href="/proprietari">
                Descrivi il tuo immobile
                <ArrowRight size={18} />
              </Link>
              <Link className="btn btn-secondary-dark" href="/property-manager">
                Registrati gratis
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-ink/10 bg-paper/90">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 lg:grid-cols-3">
          {ownerSteps.map((step, index) => (
            <div key={step} className="flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green text-sm font-bold text-white shadow-[0_14px_30px_rgba(4,120,87,0.22)]">
                {index + 1}
              </span>
              <p className="text-lg font-medium leading-7 text-ink">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="section-kicker">Marketplace</p>
            <h2 className="mt-3 max-w-xl text-4xl font-semibold leading-tight text-ink">
              Opportunita leggibili prima dell&apos;acquisto, contatti protetti
              fino al pagamento.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted">
              Il PM valuta citta, zona, immobile, servizi richiesti e tempistica.
              Nome, telefono ed email restano riservati fino allo sblocco
              autorizzato.
            </p>
            <div className="mt-8 grid gap-3">
              {pmBenefits.map((benefit) => (
                <div key={benefit} className="flex items-center gap-3 text-ink">
                  <CheckCircle2 className="text-green" size={20} />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            {demoLeads.slice(0, 3).map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-fog">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-20 sm:px-8 lg:grid-cols-3">
          <div className="stat-panel">
            <Building2 className="text-green" size={24} />
            <span className="text-4xl font-semibold text-ink">29 EUR</span>
            <p>Accesso condiviso, massimo 2 Property Manager per lead.</p>
          </div>
          <div className="stat-panel">
            <ShieldCheck className="text-coral" size={24} />
            <span className="text-4xl font-semibold text-ink">50 EUR</span>
            <p>Esclusiva acquistabile solo quando il lead ha zero acquisti.</p>
          </div>
          <div className="stat-panel">
            <CheckCircle2 className="text-green" size={24} />
            <span className="text-4xl font-semibold text-ink">7 giorni</span>
            <p>Disponibilita massima prima dello stato pubblico neutro.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
