import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PublicNav } from "@/components/public-nav";
import { OwnerRequestForm } from "@/components/owner-request-form";

const assurances = [
  "Richiesta gratuita e senza obblighi",
  "Dati condivisi solo con massimo 2 Consulenti esperti verificati",
  "Massimo 2 Property Manager interessati",
];

export default function OwnerLandingPage() {
  return (
    <main className="bg-paper">
      <section className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
        <PublicNav />
        <div className="grid gap-12 py-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="section-kicker">Per proprietari</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight text-ink sm:text-5xl">
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
            <div className="mt-8 grid gap-3">
              {assurances.map((item) => (
                <div key={item} className="flex items-start gap-3 text-sm font-semibold text-ink">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-green" size={18} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div id="richiesta">
            <OwnerRequestForm />
          </div>
        </div>
      </section>
    </main>
  );
}
