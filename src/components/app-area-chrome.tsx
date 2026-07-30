import type { ReactNode } from "react";
import { AccountSummary } from "@/components/account-summary";
import { AppSidebarNav } from "@/components/app-sidebar-nav";
import { BrandLogo } from "@/components/brand-logo";
import { MobileMenu } from "@/components/mobile-menu";
import { SiteFooter } from "@/components/site-footer";
import {
  hasAdminPermission,
  type AdminPermissionKey,
  type AdminPermissionMap,
} from "@/lib/admin/permissions";

type AppAreaChromeProps = {
  children: ReactNode;
  section: "pm" | "admin";
  adminHomeHref?: string;
  adminPermissions?: AdminPermissionMap;
  isSuperAdmin?: boolean;
};

const pmLinks = [
  { label: "Marketplace", href: "/app/marketplace" },
  { label: "I miei lead", href: "/app/i-miei-lead" },
  { label: "Wallet", href: "/app/acquisti" },
  { label: "Notifiche", href: "/app/notifiche" },
  { label: "Profilo", href: "/app/profilo" },
  { label: "Assistenza", href: "/app/assistenza" },
];

const adminLinks: Array<{
  label: string;
  href: string;
  group: string;
  permission?: AdminPermissionKey;
  superAdminOnly?: boolean;
}> = [
  { label: "Dashboard", href: "/admin", group: "Panoramica", permission: "dashboard" },
  { label: "Lead", href: "/admin/leads", group: "Operatività", permission: "leads" },
  {
    label: "Acquisizione",
    href: "/admin/acquisizione",
    group: "Operatività",
    permission: "acquisition",
  },
  {
    label: "Property Manager",
    href: "/admin/property-manager",
    group: "Operatività",
    permission: "property_managers",
  },
  {
    label: "Assistenza",
    href: "/admin/segnalazioni",
    group: "Operatività",
    permission: "support",
  },
  { label: "Pagamenti", href: "/admin/pagamenti", group: "Finanza", permission: "payments" },
  { label: "Coupon", href: "/admin/coupon", group: "Finanza", permission: "coupons" },
  {
    label: "Fatturazione",
    href: "/admin/fatturazione",
    group: "Finanza",
    permission: "billing",
  },
  { label: "Riaccrediti", href: "/admin/rimborsi", group: "Finanza", permission: "refunds" },
  {
    label: "Email",
    href: "/admin/email-transazionali",
    group: "Comunicazioni",
    permission: "emails",
  },
  { label: "Brevo", href: "/admin/brevo", group: "Comunicazioni", permission: "brevo" },
  {
    label: "Telegram",
    href: "/admin/telegram",
    group: "Comunicazioni",
    permission: "telegram",
  },
  {
    label: "Analytics",
    href: "/admin/analytics",
    group: "Dati e controllo",
    permission: "analytics",
  },
  {
    label: "Tracking",
    href: "/admin/tracking",
    group: "Dati e controllo",
    permission: "tracking",
  },
  {
    label: "Impostazioni",
    href: "/admin/impostazioni",
    group: "Configurazione",
    permission: "settings",
  },
  { label: "Team", href: "/admin/team", group: "Configurazione", superAdminOnly: true },
  { label: "Profilo", href: "/admin/profilo", group: "Configurazione" },
];

export function AppAreaChrome({
  children,
  section,
  adminHomeHref = "/admin",
  adminPermissions = {},
  isSuperAdmin = false,
}: AppAreaChromeProps) {
  const links =
    section === "admin"
      ? adminLinks.filter(
          (link) =>
            (isSuperAdmin || !link.superAdminOnly) &&
            (isSuperAdmin ||
              !link.permission ||
              hasAdminPermission(adminPermissions, link.permission)),
        )
      : pmLinks;
  const homeHref = section === "admin" ? adminHomeHref : "/app/marketplace";

  return (
    <main className="premium-shell min-h-screen">
      <aside className="premium-sidebar app-sidebar fixed inset-y-0 left-0 w-72 overflow-y-auto border-r border-slate-200 px-5 py-6">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <BrandLogo href={homeHref} />
        </div>
        <AppSidebarNav section={section} />
        <AccountSummary />
      </aside>
      <section className="app-content flex min-h-screen min-w-0 flex-col">
        <div className="premium-header app-mobile-bar relative z-[90] items-center justify-between gap-4 border-b border-ink/10 px-5 py-4">
          <BrandLogo href={homeHref} />
          <MobileMenu
            links={links}
            supportHref={section === "admin" ? "/admin/segnalazioni" : "/app/assistenza"}
            supportSection={section}
            pendingLeadsHref={section === "admin" ? "/admin/leads" : undefined}
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
