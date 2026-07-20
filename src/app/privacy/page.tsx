import { PublicNav } from "@/components/public-nav";

export default function PrivacyPage() {
  return (
    <main className="bg-paper">
      <section className="mx-auto max-w-4xl px-5 py-5 sm:px-8">
        <PublicNav />
        <article className="py-14">
          <p className="section-kicker">Privacy</p>
          <h1 className="mt-3 text-4xl font-semibold text-ink">
            Privacy Policy
          </h1>
          <p className="mt-5 leading-8 text-muted">
            Placeholder tecnico da sottoporre a consulente legale. La
            piattaforma dovra descrivere finalita, basi giuridiche, tempi di
            conservazione e condivisione dei dati con massimo 2 Property
            Manager.
          </p>
        </article>
      </section>
    </main>
  );
}
