import Link from "next/link";
import { PublicNav } from "@/components/public-nav";

type RegistrationCompletedPageProps = {
  searchParams: Promise<{
    check_email?: string;
    confirmed?: string;
  }>;
};

export default async function RegistrationCompletedPage({
  searchParams,
}: RegistrationCompletedPageProps) {
  const params = await searchParams;
  const isConfirmed = params.confirmed === "1";

  return (
    <main className="min-h-screen bg-paper">
      <section className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
        <PublicNav />
        <div className="mx-auto grid max-w-2xl py-14 sm:py-20">
          <div className="card p-6 sm:p-8">
            <p className="section-kicker">
              {isConfirmed ? "Email confermata" : "Registrazione inviata"}
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">
              {isConfirmed
                ? "Il tuo account Lead Host è stato confermato"
                : "Controlla la tua email per completare l'iscrizione"}
            </h1>
            <p className="mt-4 text-base leading-7 text-muted">
              {isConfirmed
                ? "Ora puoi accedere alla piattaforma, consultare il marketplace e gestire i tuoi lead. I dati di fatturazione serviranno solo per le ricariche wallet e le relative fatture."
                : "Ti abbiamo inviato un link di conferma. Aprilo per attivare il tuo account gratuito Lead Host."}
            </p>
            {!isConfirmed ? (
              <div className="mt-5 rounded-lg border border-green/15 bg-green/8 p-4 text-sm leading-6 text-ink">
                Se non trovi la mail in posta in arrivo, controlla anche le cartelle
                <strong> Promozioni</strong>, <strong>Spam</strong> o{" "}
                <strong>Posta indesiderata</strong>.
              </div>
            ) : null}
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link className="btn btn-primary" href="/login">
                Vai al login
              </Link>
              <Link className="btn btn-secondary" href="/">
                Torna alla home
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
