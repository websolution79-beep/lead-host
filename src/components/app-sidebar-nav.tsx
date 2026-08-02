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
  CreditCard,
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
  category: "Operatività",
};

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
          highlighted: session.marketingAddon.hasAccess,
        },
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
        const Icon = link.icon;
        const category = link.category;
        const previousLink = links[index - 1];
        const previousCategory = previousLink?.category;
        const showCategory = Boolean(category && category !== previousCategory);
        const isActive =
          link.href === "/app" || link.href === "/admin"
            ? pathname === link.href
            : pathname.startsWith(link.href);
        const isHighlighted = Boolean(link.highlighted && !isActive);

        return (
          <Fragment key={link.href}>
            {showCategory ? (
              <p className="mb-1 mt-4 px-3 text-[11px] font-bold uppercase text-slate-400">
                {category}
              </p>
            ) : null}
            <Link
              href={link.href}
              className={`group flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
                isActive
                  ? "bg-green text-white shadow-[0_12px_30px_rgba(4,120,87,0.18)]"
                  : isHighlighted
                    ? "border border-emerald-300 bg-emerald-50 text-emerald-800 shadow-[0_8px_24px_rgba(4,120,87,0.10)]"
                  : "text-slate-600 hover:bg-slate-100 hover:text-ink"
              }`}
            >
              <span
                className={`flex size-8 items-center justify-center rounded-md transition ${
                  isActive
                    ? "bg-white/12 text-white"
                    : isHighlighted
                      ? "bg-white text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-white text-slate-500 ring-1 ring-slate-200 group-hover:text-green"
                }`}
              >
                <Icon size={17} />
              </span>
              {link.label}
              {link.href === "/app/marketing" && session.marketingAddon?.hasAccess ? (
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isActive ? "bg-white/15 text-white" : "bg-emerald-100 text-emerald-800"}`}>
                  Attivo
                </span>
              ) : null}
              {section === "admin" && link.href === "/admin/leads" ? (
                <AdminLeadNavBadge />
              ) : null}
              {link.href === supportBadgeHref ? <SupportNavBadge section={section} /> : null}
            </Link>
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
