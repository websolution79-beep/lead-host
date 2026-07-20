import Link from "next/link";
import { PublicNav } from "@/components/public-nav";

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
            <form className="mt-7 grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-ink">
                Email
                <input
                  className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
                  type="email"
                  placeholder="nome@azienda.it"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-ink">
                Password
                <input
                  className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
                  type="password"
                  placeholder="Password"
                />
              </label>
              <button className="btn btn-primary mt-2" type="button">
                Accedi
              </button>
            </form>
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
