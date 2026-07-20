import Link from "next/link";
import { Suspense } from "react";
import { PublicNav } from "@/components/public-nav";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-paper">
      <section className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
        <PublicNav />
        <div className="mx-auto flex max-w-md flex-col py-16">
          <div className="card p-6 sm:p-8">
            <p className="section-kicker">Accesso</p>
            <h1 className="mt-3 text-3xl font-semibold text-ink">
              Entra in Lead Host
            </h1>
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
            <p className="mt-5 text-sm text-muted">
              Sei un Property Manager?{" "}
              <Link className="font-semibold text-green" href="/property-manager">
                Registrati gratis
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
