import { PublicNav } from "@/components/public-nav";

export default function TermsPage() {
  return (
    <main className="bg-paper">
      <section className="mx-auto max-w-4xl px-5 py-5 sm:px-8">
        <PublicNav />
        <article className="py-14">
          <p className="section-kicker">Termini</p>
          <h1 className="mt-3 text-4xl font-semibold text-ink">
            Termini e Condizioni
          </h1>
          <p className="mt-5 leading-8 text-muted">
            Placeholder tecnico. Le regole commerciali fondamentali restano:
            PM gratuito, 29 EUR condiviso, 50 EUR esclusivo, massimo 2 PM per
            lead e nessun rimborso automatico per mancata risposta.
          </p>
        </article>
      </section>
    </main>
  );
}
