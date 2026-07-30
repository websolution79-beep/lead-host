import type { Metadata } from "next";
import { PublicNav } from "@/components/public-nav";
import { PasswordUpdateForm } from "@/components/password-update-form";
import { getServerSessionProfile } from "@/lib/auth/server-session";
import { privatePageRobots } from "@/lib/seo/robots";

export const metadata: Metadata = {
  title: "Reimposta password",
  robots: privatePageRobots,
};

export default async function ResetPasswordPage() {
  const session = await getServerSessionProfile();
  const minimumLength =
    session?.roles.includes("team_member") && !session.isSuperAdmin ? 12 : 8;

  return (
    <main className="min-h-screen bg-paper">
      <section className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
        <PublicNav />
        <div className="mx-auto flex max-w-md flex-col py-16">
          <div className="card p-6 sm:p-8">
            <p className="section-kicker">Sicurezza account</p>
            <h1 className="mt-3 text-3xl font-semibold text-ink">
              Scegli una nuova password
            </h1>
            <PasswordUpdateForm minimumLength={minimumLength} />
          </div>
        </div>
      </section>
    </main>
  );
}
