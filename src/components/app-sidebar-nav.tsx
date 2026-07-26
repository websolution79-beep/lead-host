"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Building2,
  CreditCard,
  Crosshair,
  Inbox,
  LifeBuoy,
  Mail,
  MessagesSquare,
  Map,
  Megaphone,
  ReceiptText,
  Send,
  Settings,
  ShieldAlert,
  UserCircle,
  Users,
} from "lucide-react";
import { RoleSwitcher } from "@/components/role-switcher";
import { AdminLeadNavBadge } from "@/components/admin-lead-nav-badge";
import { SupportNavBadge } from "@/components/support-nav-badge";

type AppSidebarNavProps = {
  section: "pm" | "admin";
};

type AppNavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
  category?: string;
};

const pmLinks: AppNavLink[] = [
  { label: "Marketplace", href: "/app/marketplace", icon: Map },
  { label: "I miei lead", href: "/app/i-miei-lead", icon: Inbox },
  { label: "Wallet", href: "/app/acquisti", icon: CreditCard },
  { label: "Notifiche", href: "/app/notifiche", icon: Bell },
  { label: "Profilo", href: "/app/profilo", icon: UserCircle },
  { label: "Assistenza", href: "/app/assistenza", icon: LifeBuoy },
];

const adminLinks: AppNavLink[] = [
  { label: "Dashboard", href: "/admin", icon: BarChart3, category: "Panoramica" },
  { label: "Lead", href: "/admin/leads", icon: Inbox, category: "Operatività" },
  {
    label: "Acquisizione",
    href: "/admin/acquisizione",
    icon: Megaphone,
    category: "Operatività",
  },
  {
    label: "Property Manager",
    href: "/admin/property-manager",
    icon: Users,
    category: "Operatività",
  },
  {
    label: "Assistenza",
    href: "/admin/segnalazioni",
    icon: ShieldAlert,
    category: "Operatività",
  },
  { label: "Pagamenti", href: "/admin/pagamenti", icon: ReceiptText, category: "Finanza" },
  { label: "Riaccrediti", href: "/admin/rimborsi", icon: CreditCard, category: "Finanza" },
  {
    label: "Email",
    href: "/admin/email-transazionali",
    icon: Mail,
    category: "Comunicazioni",
  },
  { label: "Brevo", href: "/admin/brevo", icon: MessagesSquare, category: "Comunicazioni" },
  { label: "Telegram", href: "/admin/telegram", icon: Send, category: "Comunicazioni" },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3, category: "Dati e controllo" },
  { label: "Tracking", href: "/admin/tracking", icon: Crosshair, category: "Dati e controllo" },
  {
    label: "Impostazioni",
    href: "/admin/impostazioni",
    icon: Settings,
    category: "Configurazione",
  },
  { label: "Profilo", href: "/admin/profilo", icon: UserCircle, category: "Configurazione" },
];

export function AppSidebarNav({ section }: AppSidebarNavProps) {
  const pathname = usePathname();
  const links = section === "admin" ? adminLinks : pmLinks;
  const contextLabel = section === "admin" ? "Area Super Admin" : "Area Property Manager";
  const contextDescription =
    section === "admin"
      ? "Gestione piattaforma, lead, PM, pagamenti e analytics."
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
                  : "text-slate-600 hover:bg-slate-100 hover:text-ink"
              }`}
            >
              <span
                className={`flex size-8 items-center justify-center rounded-md transition ${
                  isActive
                    ? "bg-white/12 text-white"
                    : "bg-white text-slate-500 ring-1 ring-slate-200 group-hover:text-green"
                }`}
              >
                <Icon size={17} />
              </span>
              {link.label}
              {section === "admin" && link.href === "/admin/leads" ? (
                <AdminLeadNavBadge />
              ) : null}
              {link.href === supportBadgeHref ? <SupportNavBadge section={section} /> : null}
            </Link>
          </Fragment>
        );
      })}

      <RoleSwitcher section={section} />

      {section === "pm" ? (
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
