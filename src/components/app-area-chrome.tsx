import type { ReactNode } from "react";
import { AccountSummary } from "@/components/account-summary";
import { AppSidebarNav } from "@/components/app-sidebar-nav";
import { BrandLogo } from "@/components/brand-logo";
import { MobileMenu } from "@/components/mobile-menu";
import { SiteFooter } from "@/components/site-footer";

type AppAreaChromeProps = {
  children: ReactNode;
  section: "pm" | "admin";
};

const pmLinks = [
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
  { label: "Assistenza", href: "/admin/segnalazioni" },
  { label: "Riaccrediti", href: "/admin/rimborsi" },
  { label: "Analytics", href: "/admin/analytics" },
  { label: "Email", href: "/admin/email-transazionali" },
  { label: "Impostazioni", href: "/admin/impostazioni" },
  { label: "Profilo", href: "/admin/profilo" },
];

export function AppAreaChrome({ children, section }: AppAreaChromeProps) {
  const links = section === "admin" ? adminLinks : pmLinks;
  const homeHref = section === "admin" ? "/admin" : "/app/marketplace";

  return (
    <main className="premium-shell min-h-screen">
      <aside className="premium-sidebar app-sidebar fixed inset-y-0 left-0 w-72 overflow-y-auto border-r border-slate-200 px-5 py-6">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <BrandLogo href={homeHref} />
        </div>
        <AppSidebarNav section={section} />
        <AccountSummary />
      </aside>
      <section className="app-content flex min-h-screen flex-col">
        <div className="premium-header app-mobile-bar relative z-[90] items-center justify-between gap-4 border-b border-ink/10 px-5 py-4">
          <BrandLogo href={homeHref} />
          <MobileMenu
            links={links}
            supportHref={section === "admin" ? "/admin/segnalazioni" : "/app/assistenza"}
            supportSection={section}
            roleSwitchSection={section}
            label="Menu"
            hideAt="lg"
          />
        </div>
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </section>
    </main>
  );
}
