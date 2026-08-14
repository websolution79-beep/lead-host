"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BadgePercent,
  Bell,
  Building2,
  Calculator,
  CreditCard,
  DatabaseBackup,
  Crosshair,
  Columns3,
  FileText,
  Inbox,
  LifeBuoy,
  Mail,
  MessagesSquare,
  Map,
  Megaphone,
  PackageOpen,
  ReceiptText,
  Send,
  Settings,
  ShieldAlert,
  UserCircle,
  Users,
  UsersRound,
} from "lucide-react";
import { RoleSwitcher } from "@/components/role-switcher";
import { AdminLeadNavBadge } from "@/components/admin-lead-nav-badge";
import { SupportNavBadge } from "@/components/support-nav-badge";
import { useAppSession } from "@/components/app-session-provider";
import {
  hasAdminPermission,
  type AdminPermissionKey,
} from "@/lib/admin/permissions";

type AppSidebarNavProps = {
  section: "pm" | "admin";
};

type AppNavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
  category?: string;
  permission?: AdminPermissionKey;
  superAdminOnly?: boolean;
  highlighted?: boolean;
  exact?: boolean;
  subitem?: boolean;
  subitemLast?: boolean;
  grouped?: boolean;
};

const pmLinks: AppNavLink[] = [
  {
    label: "Marketplace",
    href: "/app/marketplace",
    icon: Map,
    category: "Operatività",
    permission: "marketplace",
  },
  {
    label: "I miei lead",
    href: "/app/i-miei-lead",
    icon: Inbox,
    category: "Operatività",
  },
  { label: "Wallet", href: "/app/acquisti", icon: CreditCard, category: "Finanza" },
  { label: "Notifiche", href: "/app/notifiche", icon: Bell, category: "Comunicazioni" },
  { label: "Assistenza", href: "/app/assistenza", icon: LifeBuoy, category: "Comunicazioni" },
  { label: "Profilo", href: "/app/profilo", icon: UserCircle, category: "Account" },
];

const marketingPreviewLink: AppNavLink = {
  label: "Marketing",
  href: "/app/marketing",
  icon: Columns3,
  exact: true,
  grouped: true,
};

const marketingToolLinks: AppNavLink[] = [
  {
    label: "CRM",
    href: "/app/marketing/crm",
    icon: Columns3,
    subitem: true,
  },
  {
    label: "Rendita Stimata",
    href: "/app/marketing/rendita-stimata",
    icon: Calculator,
    subitem: true,
    subitemLast: true,
  },
];

const adminLinks: AppNavLink[] = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: BarChart3,
    category: "Panoramica",
    permission: "dashboard",
  },
  {
    label: "Marketplace",
    href: "/admin/marketplace",
    icon: Map,
    category: "Operatività",
    permission: "marketplace",
  },
  {
    label: "Lead",
    href: "/admin/leads",
    icon: Inbox,
    category: "Operatività",
    permission: "leads",
  },
  {
    label: "Acquisizione",
    href: "/admin/acquisizione",
    icon: Megaphone,
    category: "Operatività",
    permission: "acquisition",
  },
  {
    label: "Property Manager",
    href: "/admin/property-manager",
    icon: Users,
    category: "Operatività",
    permission: "property_managers",
  },
  {
    label: "Assistenza",
    href: "/admin/segnalazioni",
    icon: ShieldAlert,
    category: "Operatività",
    permission: "support",
  },
  {
    label: "Pagamenti",
    href: "/admin/pagamenti",
    icon: ReceiptText,
    category: "Finanza",
    permission: "payments",
  },
  {
    label: "Coupon",
    href: "/admin/coupon",
    icon: BadgePercent,
    category: "Finanza",
    permission: "coupons",
  },
  {
    label: "Fatturazione",
    href: "/admin/fatturazione",
    icon: FileText,
    category: "Finanza",
    permission: "billing",
  },
  {
    label: "Riaccrediti",
    href: "/admin/rimborsi",
    icon: CreditCard,
    category: "Finanza",
    permission: "refunds",
  },
  {
    label: "Email",
    href: "/admin/email-transazionali",
    icon: Mail,
    category: "Comunicazioni",
    permission: "emails",
  },
  {
    label: "Brevo",
    href: "/admin/brevo",
    icon: MessagesSquare,
    category: "Comunicazioni",
    permission: "brevo",
  },
  {
    label: "Telegram",
    href: "/admin/telegram",
    icon: Send,
    category: "Comunicazioni",
    permission: "telegram",
  },
  {
    label: "Analytics",
    href: "/admin/analytics",
    icon: BarChart3,
    category: "Dati e controllo",
    permission: "analytics",
  },
  {
    label: "Tracking",
    href: "/admin/tracking",
    icon: Crosshair,
    category: "Dati e controllo",
    permission: "tracking",
  },
  {
    label: "Backup",
    href: "/admin/backup",
    icon: DatabaseBackup,
    category: "Dati e controllo",
    superAdminOnly: true,
  },
  {
    label: "Impostazioni",
    href: "/admin/impostazioni",
    icon: Settings,
    category: "Configurazione",
    permission: "settings",
  },
  {
    label: "Addons",
    href: "/admin/addons",
    icon: PackageOpen,
    category: "Configurazione",
    superAdminOnly: true,
  },
  {
    label: "Team",
    href: "/admin/team",
    icon: UsersRound,
    category: "Configurazione",
    superAdminOnly: true,
  },
  {
    label: "Profilo",
    href: "/admin/profilo",
    icon: UserCircle,
    category: "Configurazione",
  },
];

export function AppSidebarNav({ section }: AppSidebarNavProps) {
  const pathname = usePathname();
  const session = useAppSession();
  const isRestrictedTeamMember =
    session.roles.includes("team_member") && !session.isSuperAdmin;
  const allowedAdminLinks = adminLinks.filter(
    (link) =>
      !link.superAdminOnly &&
      (!link.permission ||
        hasAdminPermission(session.adminPermissions ?? {}, link.permission)),
  );
  const pmNavigationLinks = session.marketingAddon?.menuVisible
    ? [
        pmLinks[0],
        pmLinks[1],
        {
          ...marketingPreviewLink,
          highlighted: true,
        },
        ...(session.marketingAddon.hasAccess ? marketingToolLinks : []),
        ...pmLinks.slice(2),
      ]
    : pmLinks;
  const links =
    section === "admin"
      ? session.isSuperAdmin
        ? adminLinks
        : allowedAdminLinks
      : isRestrictedTeamMember
        ? [
            ...pmLinks.filter(
              (link) =>
                link.permission === "marketplace" &&
                hasAdminPermission(session.adminPermissions ?? {}, "marketplace"),
            ),
            ...allowedAdminLinks.filter((link) => link.href !== "/admin/marketplace"),
          ]
        : pmNavigationLinks;
  const isTeamMemberMarketplaceView = section === "pm" && isRestrictedTeamMember;
  const contextLabel =
    section === "admin"
      ? session.isSuperAdmin
        ? "Area Super Admin"
        : "Area Team"
      : isTeamMemberMarketplaceView
        ? "Area Team"
        : "Area Property Manager";
  const contextDescription =
    section === "admin"
      ? session.isSuperAdmin
        ? "Gestione piattaforma, lead, PM, pagamenti e analytics."
        : "Accesso limitato alle sezioni assegnate al tuo ruolo."
      : isTeamMemberMarketplaceView
        ? "Marketplace e sezioni assegnate al tuo ruolo."
        : "Marketplace, lead acquistati, wallet e profilo PM.";
  const supportHref = section === "admin" ? "/admin/impostazioni" : "/app/assistenza";
  const supportBadgeHref = section === "admin" ? "/admin/segnalazioni" : "/app/assistenza";
  const supportLabel = section === "admin" ? "Impostazioni" : "Assistenza";
  const SupportIcon = section === "admin" ? Settings : LifeBuoy;

  return (
    <nav className="mt-8 grid gap-1.5">
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Building2 size={16} className="text-green" />
          {contextLabel}
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">{contextDescription}</p>
      </div>

      {links.map((link, index) => {
        if (link.subitem) return null;

        const category = link.category;
        const previousLink = links[index - 1];
        const previousCategory = previousLink?.category;
        const showCategory = Boolean(category && category !== previousCategory);
        const renderLink = (item: AppNavLink, subitem = false) => {
          const ItemIcon = item.icon;
          const itemIsActive = item.exact
            ? pathname === item.href
            : item.href === "/app" || item.href === "/admin"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          const itemIsHighlighted = Boolean(item.highlighted && !itemIsActive);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
                subitem
                  ? `ml-3 rounded-lg text-slate-600 hover:bg-emerald-50 hover:text-ink ${itemIsActive ? "bg-emerald-100 text-emerald-900" : ""}`
                    : itemIsActive
                      ? item.grouped
                        ? "bg-transparent text-emerald-800"
                        : "bg-green text-white shadow-[0_12px_30px_rgba(4,120,87,0.18)]"
                    : itemIsHighlighted
                      ? item.grouped
                        ? session.marketingAddon?.hasAccess
                          ? "bg-transparent text-emerald-800"
                          : "border border-emerald-300 bg-emerald-50 text-emerald-800 shadow-[0_8px_24px_rgba(4,120,87,0.10)]"
                        : "bg-transparent text-emerald-800"
                      : "text-slate-600 hover:bg-slate-100 hover:text-ink"
              }`}
            >
              <span
                className={`flex size-8 items-center justify-center rounded-md transition ${
                  itemIsActive && !item.grouped
                    ? "bg-white/12 text-white"
                    : itemIsHighlighted || item.grouped
                      ? "bg-white text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-white text-slate-500 ring-1 ring-slate-200 group-hover:text-green"
                }`}
              >
                <ItemIcon size={17} />
              </span>
              {item.label}
              {item.href === "/app/marketing" && session.marketingAddon?.menuVisible ? (
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${itemIsActive ? "bg-emerald-100 text-emerald-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {session.marketingAddon.hasAccess ? "Attivo" : "Prova gratis"}
                </span>
              ) : null}
              {section === "admin" && item.href === "/admin/leads" ? (
                <AdminLeadNavBadge />
              ) : null}
              {item.href === supportBadgeHref ? <SupportNavBadge section={section} /> : null}
            </Link>
          );
        };

        const marketingGroup = link.grouped && session.marketingAddon?.hasAccess;

        return (
          <Fragment key={link.href}>
            {showCategory ? (
              <p className="mb-1 mt-4 px-3 text-[11px] font-bold uppercase text-slate-400">
                {category}
              </p>
            ) : null}
            {marketingGroup ? (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50/35 p-1 shadow-[0_8px_24px_rgba(4,120,87,0.08)]">
                {renderLink(link)}
                {marketingToolLinks.map((tool) => renderLink(tool, true))}
              </div>
            ) : (
              renderLink(link)
            )}
          </Fragment>
        );
      })}

      <RoleSwitcher section={section} />

      {section === "pm" && !isTeamMemberMarketplaceView ? (
        <Link
          href={supportHref}
          className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:border-green/30 hover:text-green"
        >
          <SupportIcon size={16} />
          {supportLabel}
        </Link>
      ) : null}
    </nav>
  );
}
