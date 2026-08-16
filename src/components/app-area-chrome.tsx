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
import type { MarketingAddonState } from "@/lib/addons/access";

type AppAreaChromeProps = {
  children: ReactNode;
  section: "pm" | "admin";
  adminHomeHref?: string;
  adminPermissions?: AdminPermissionMap;
  isSuperAdmin?: boolean;
  marketingAddon?: MarketingAddonState;
  primeAccess?: boolean;
};

const pmLinks = [
  { label: "Marketplace", href: "/app/marketplace" },
  { label: "I miei lead", href: "/app/i-miei-lead" },
  { label: "Wallet", href: "/app/acquisti" },
  { label: "Notifiche", href: "/app/notifiche" },
  { label: "Profilo", href: "/app/profilo" },
  { label: "Assistenza", href: "/app/assistenza" },
];

const primeZoneLink = {
  label: "Prime Zone",
  href: "/app/prime",
  highlighted: true,
  prime: true,
};

const marketingPreviewLink = {
  label: "Marketing",
  href: "/app/marketing",
  grouped: true,
  groupId: "marketing",
};
const marketingToolLinks = [
  { label: "CRM", href: "/app/marketing/crm", subitem: true, groupId: "marketing" },
  {
    label: "Rendita Stimata",
    href: "/app/marketing/rendita-stimata",
    subitem: true,
    subitemLast: true,
    groupId: "marketing",
  },
];

const adminLinks: Array<{
  label: string;
  href: string;
  group: string;
  permission?: AdminPermissionKey;
  superAdminOnly?: boolean;
  grouped?: boolean;
  subitem?: boolean;
  subitemLast?: boolean;
  groupId?: string;
}> = [
  { label: "Dashboard", href: "/admin", group: "Panoramica", permission: "dashboard" },
  {
    label: "Marketplace",
    href: "/admin/marketplace",
    group: "Operatività",
    permission: "marketplace",
  },
  { label: "Lead", href: "/admin/leads", group: "Operatività", permission: "leads" },
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
  {
    label: "Lead Host PRIME",
    href: "/admin/prime",
    group: "Lead Host PRIME",
    permission: "prime",
    grouped: true,
    groupId: "admin-prime",
  },
  {
    label: "Prime Zone",
    href: "/admin/prime-zone",
    group: "Lead Host PRIME",
    permission: "prime",
    subitem: true,
    subitemLast: true,
    groupId: "admin-prime",
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
    label: "Backup",
    href: "/admin/backup",
    group: "Dati e controllo",
    superAdminOnly: true,
  },
  {
    label: "Impostazioni",
    href: "/admin/impostazioni",
    group: "Configurazione",
    permission: "settings",
  },
  {
    label: "Impostazioni PRIME",
    href: "/admin/prime/impostazioni",
    group: "Configurazione",
    superAdminOnly: true,
  },
  {
    label: "Acquisizione",
    href: "/admin/acquisizione",
    group: "Configurazione",
    permission: "acquisition",
  },
  {
    label: "Addons",
    href: "/admin/addons",
    group: "Configurazione",
    superAdminOnly: true,
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
  marketingAddon,
  primeAccess = false,
}: AppAreaChromeProps) {
  const basePmLinks = primeAccess
    ? [pmLinks[0], primeZoneLink, ...pmLinks.slice(1)]
    : pmLinks;
  const marketingInsertIndex = primeAccess ? 3 : 2;
  const links =
    section === "admin"
      ? adminLinks.filter(
          (link) =>
            (isSuperAdmin || !link.superAdminOnly) &&
            (isSuperAdmin ||
              !link.permission ||
              hasAdminPermission(adminPermissions, link.permission)),
        )
      : marketingAddon?.menuVisible
        ? [
            ...basePmLinks.slice(0, marketingInsertIndex),
            { ...marketingPreviewLink, highlighted: marketingAddon.hasAccess },
            ...(marketingAddon.hasAccess ? marketingToolLinks : []),
            ...basePmLinks.slice(marketingInsertIndex),
          ]
        : basePmLinks;
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
