import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { MobileMenu } from "@/components/mobile-menu";
import { AppSidebarNav } from "@/components/app-sidebar-nav";
import { AccountSummary } from "@/components/account-summary";
import { AuthGate } from "@/components/auth-gate";

type AppShellProps = {
  title: string;
  eyebrow: string;
  children: ReactNode;
  section: "pm" | "admin";
};

const pmLinks = [
  { label: "Dashboard", href: "/app" },
  { label: "Marketplace", href: "/app/marketplace" },
  { label: "I miei lead", href: "/app/i-miei-lead" },
  { label: "Wallet", href: "/app/acquisti" },
  { label: "Notifiche", href: "/app/notifiche" },
  { label: "Profilo", href: "/app/profilo" },
  { label: "Assistenza", href: "/app/assistenza" },
];

const adminLinks = [
  { label: "Dashboard", href: "/admin" },
  { label: "Lead", href: "/admin/leads" },
  { label: "Acquisizione", href: "/admin/acquisizione" },
  { label: "Property Manager", href: "/admin/property-manager" },
  { label: "Pagamenti", href: "/admin/pagamenti" },
  { label: "Segnalazioni", href: "/admin/segnalazioni" },
  { label: "Rimborsi", href: "/admin/rimborsi" },
  { label: "Analytics", href: "/admin/analytics" },
  { label: "Impostazioni", href: "/admin/impostazioni" },
  { label: "Profilo", href: "/admin/profilo" },
];

export function AppShell({ title, eyebrow, children, section }: AppShellProps) {
  const links = section === "admin" ? adminLinks : pmLinks;

  return (
    <AuthGate section={section}>
      <main className="premium-shell min-h-screen">
        <aside className="premium-sidebar app-sidebar fixed inset-y-0 left-0 w-72 overflow-y-auto border-r border-slate-200 px-5 py-6">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <BrandLogo />
          </div>
          <AppSidebarNav section={section} />
          <AccountSummary />
        </aside>
        <section className="app-content">
          <div className="premium-header app-mobile-bar items-center justify-between gap-4 border-b border-ink/10 px-5 py-4">
            <BrandLogo />
            <MobileMenu links={links} label="Sezioni" hideAt="lg" />
          </div>
          <header className="premium-header border-b border-ink/10">
            <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
              <p className="section-kicker">{eyebrow}</p>
              <h1 className="mt-2 text-3xl font-semibold text-ink">{title}</h1>
            </div>
          </header>
          <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">{children}</div>
        </section>
      </main>
    </AuthGate>
  );
}
