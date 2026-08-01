import type { ReactNode } from "react";
import { AccountSummary } from "@/components/account-summary";
import { AdminAccessBoundary } from "@/components/admin-access-boundary";
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
  isMarketingPreviewVisible?: boolean;
};

const pmLinks = [
  { label: "Marketplace", href: "/app/marketplace" },
  { label: "I miei lead", href: "/app/i-miei-lead" },
  { label: "Wallet", href: "/app/acquisti" },
  { label: "Notifiche", href: "/app/notifiche" },
  { label: "Profilo", href: "/app/profilo" },
  { label: "Assistenza", href: "/app/assistenza" },
];

const marketingPreviewLink = { label: "Marketing", href: "/app/marketing" };

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
  isMarketingPreviewVisible = false,
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
      : isMarketingPreviewVisible
        ? [pmLinks[0], marketingPreviewLink, ...pmLinks.slice(1)]
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
      <section className="app-content flex min-h-screen min-w-0 max-w-full flex-col overflow-x-clip">
        <div className="premium-header app-mobile-bar relative z-[90] items-center justify-between gap-4 border-b border-ink/10 px-5 py-4">
          <div className="min-w-0 flex-1">
            <BrandLogo href={homeHref} />
          </div>
          <MobileMenu
            links={links}
            supportHref={section === "admin" ? "/admin/segnalazioni" : "/app/assistenza"}
            supportSection={section}
            adminLeadBadgeHref={section === "admin" ? "/admin/leads" : undefined}
            roleSwitchSection={section}
            label="Menu"
            hideAt="lg"
          />
        </div>
        <div className="flex-1">
          {section === "admin" ? (
            <AdminAccessBoundary>{children}</AdminAccessBoundary>
          ) : (
            children
          )}
        </div>
        <SiteFooter />
      </section>
    </main>
  );
}
