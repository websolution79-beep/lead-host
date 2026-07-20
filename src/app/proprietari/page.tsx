import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PublicNav } from "@/components/public-nav";

const fields = [
  "Nome e contatti",
  "Posizione immobile",
  "Caratteristiche",
  "Servizi richiesti",
  "Tempistiche",
];

export default function OwnerLandingPage() {
  return (
    <main className="bg-paper">
      <section className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
        <PublicNav />
        <div className="grid gap-12 py-16 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="section-kicker">Per proprietari</p>
            <h1 className="mt-4 max-w-2xl text-5xl font-semibold leading-tight text-ink">
              Trova il Property Manager giusto per il tuo immobile.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
              Invia gratuitamente la richiesta, senza obblighi. Potrai essere
              contattato da massimo 2 Property Manager interessati.
            </p>
            <Link className="btn btn-primary mt-9" href="#richiesta">
              Descrivi il tuo immobile
              <ArrowRight size={18} />
            </Link>
          </div>

          <div id="richiesta" className="card p-5 sm:p-7">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-green">
              Richiesta gratuita
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-ink">
              Form proprietario
            </h2>
            <div className="mt-6 grid gap-3">
              {fields.map((field, index) => (
                <div
                  key={field}
                  className="flex min-h-14 items-center justify-between rounded-lg border border-ink/10 px-4"
                >
                  <span className="font-medium text-ink">{field}</span>
                  <span className="text-sm font-semibold text-muted">
                    Step {index + 1}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-start gap-3 rounded-lg bg-fog p-4 text-sm leading-6 text-muted">
              <CheckCircle2 className="mt-0.5 shrink-0 text-green" size={18} />
              <p>
                La Fase 2 trasformera questa struttura in un form multi-step
                collegato alla pipeline unica di acquisizione.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
