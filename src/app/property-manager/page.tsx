import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PublicNav } from "@/components/public-nav";

const points = [
  "Registrazione gratuita",
  "Nessun abbonamento obbligatorio",
  "Visualizzazione gratuita delle opportunita",
  "Pagamento solo per i contatti scelti",
  "Massimo 2 PM per richiesta",
  "Possibilita di esclusiva",
];

export default function PropertyManagerLandingPage() {
  return (
    <main className="bg-white">
      <section className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
        <PublicNav />
        <div className="grid gap-12 py-16 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <p className="section-kicker">Per Property Manager</p>
            <h1 className="mt-4 max-w-2xl text-5xl font-semibold leading-tight text-ink">
              Trova nuovi immobili da gestire.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
              Accedi alle richieste di proprietari che cercano un professionista
              e sblocca solo i contatti che vuoi lavorare.
            </p>
            <Link className="btn btn-primary mt-9" href="/login">
              Registrati gratis
              <ArrowRight size={18} />
            </Link>
          </div>
          <div className="grid gap-3">
            {points.map((point) => (
              <div key={point} className="card flex items-center gap-3 p-4">
                <CheckCircle2 size={20} className="text-green" />
                <span className="font-medium text-ink">{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
