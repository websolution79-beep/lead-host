import Link from "next/link";
import { PublicNav } from "@/components/public-nav";
import { PasswordResetRequestForm } from "@/components/password-reset-request-form";

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen bg-paper">
      <section className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
        <PublicNav />
        <div className="mx-auto flex max-w-md flex-col py-16">
          <div className="card p-6 sm:p-8">
            <p className="section-kicker">Recupero account</p>
            <h1 className="mt-3 text-3xl font-semibold text-ink">
              Reimposta la password
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted">
              Inserisci l&apos;email usata per registrarti a Lead Host.
            </p>
            <PasswordResetRequestForm />
            <Link
              className="mt-5 inline-flex text-sm font-semibold text-green hover:underline"
              href="/login"
            >
              Torna al login
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
