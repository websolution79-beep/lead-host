"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Building2,
  CreditCard,
  Inbox,
  LifeBuoy,
  Mail,
  Map,
  Megaphone,
  ReceiptText,
  Settings,
  ShieldAlert,
  UserCircle,
  Users,
} from "lucide-react";
import { RoleSwitcher } from "@/components/role-switcher";
import { SupportNavBadge } from "@/components/support-nav-badge";

type AppSidebarNavProps = {
  section: "pm" | "admin";
};

const pmLinks = [
  { label: "Marketplace", href: "/app/marketplace", icon: Map },
  { label: "I miei lead", href: "/app/i-miei-lead", icon: Inbox },
  { label: "Wallet", href: "/app/acquisti", icon: CreditCard },
  { label: "Notifiche", href: "/app/notifiche", icon: Bell },
  { label: "Profilo", href: "/app/profilo", icon: UserCircle },
  { label: "Assistenza", href: "/app/assistenza", icon: LifeBuoy },
];

const adminLinks = [
  { label: "Dashboard", href: "/admin", icon: BarChart3 },
  { label: "Lead", href: "/admin/leads", icon: Inbox },
  { label: "Acquisizione", href: "/admin/acquisizione", icon: Megaphone },
  { label: "Property Manager", href: "/admin/property-manager", icon: Users },
  { label: "Pagamenti", href: "/admin/pagamenti", icon: ReceiptText },
  { label: "Assistenza", href: "/admin/segnalazioni", icon: ShieldAlert },
  { label: "Riaccrediti", href: "/admin/rimborsi", icon: CreditCard },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { label: "Email", href: "/admin/email-transazionali", icon: Mail },
  { label: "Impostazioni", href: "/admin/impostazioni", icon: Settings },
  { label: "Profilo", href: "/admin/profilo", icon: UserCircle },
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

      {links.map((link) => {
        const Icon = link.icon;
        const isActive =
          link.href === "/app" || link.href === "/admin"
            ? pathname === link.href
            : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
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
            {link.href === supportBadgeHref ? <SupportNavBadge section={section} /> : null}
          </Link>
        );
      })}

      <RoleSwitcher section={section} />

      <Link
        href={supportHref}
        className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:border-green/30 hover:text-green"
      >
        <SupportIcon size={16} />
        {supportLabel}
      </Link>
    </nav>
  );
}
