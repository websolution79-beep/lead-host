import { PublicNav } from "@/components/public-nav";

type CompletionPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function CompletionPage({ params }: CompletionPageProps) {
  const { token } = await params;

  return (
    <main className="bg-paper">
      <section className="mx-auto max-w-4xl px-5 py-5 sm:px-8">
        <PublicNav />
        <article className="card my-14 p-6 sm:p-8">
          <p className="section-kicker">Completamento richiesta</p>
          <h1 className="mt-3 text-3xl font-semibold text-ink">
            Completa i dettagli del tuo immobile
          </h1>
          <p className="mt-5 leading-8 text-muted">
            Token ricevuto: <span className="font-mono">{token.slice(0, 8)}</span>
            . In Fase 3 questo token sara verificato con hash, scadenza e
            invalidazione server-side.
          </p>
        </article>
      </section>
    </main>
  );
}
