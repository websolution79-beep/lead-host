"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Building2,
  CreditCard,
  Gauge,
  Headphones,
  Inbox,
  LifeBuoy,
  Map,
  Megaphone,
  ReceiptText,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  UserCircle,
  Users,
} from "lucide-react";

type AppSidebarNavProps = {
  section: "pm" | "admin";
};

const pmLinks = [
  { label: "Dashboard", href: "/app", icon: Gauge },
  { label: "Marketplace", href: "/app/marketplace", icon: Map },
  { label: "I miei lead", href: "/app/i-miei-lead", icon: Inbox },
  { label: "Acquisti", href: "/app/acquisti", icon: CreditCard },
  { label: "Notifiche", href: "/app/notifiche", icon: Bell },
  { label: "Profilo", href: "/app/profilo", icon: UserCircle },
  { label: "Assistenza", href: "/app/assistenza", icon: LifeBuoy },
];

const adminLinks = [
  { label: "Dashboard", href: "/admin", icon: Gauge },
  { label: "Acquisizione", href: "/admin/acquisizione", icon: Megaphone },
  { label: "Meta Lead Ads", href: "/admin/acquisizione/meta", icon: SlidersHorizontal },
  { label: "Lead", href: "/admin/leads", icon: Inbox },
  { label: "Property Manager", href: "/admin/property-manager", icon: Users },
  { label: "Pagamenti", href: "/admin/pagamenti", icon: ReceiptText },
  { label: "Segnalazioni", href: "/admin/segnalazioni", icon: ShieldAlert },
  { label: "Rimborsi", href: "/admin/rimborsi", icon: CreditCard },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { label: "Impostazioni", href: "/admin/impostazioni", icon: Settings },
];

export function AppSidebarNav({ section }: AppSidebarNavProps) {
  const pathname = usePathname();
  const links = section === "admin" ? adminLinks : pmLinks;

  return (
    <nav className="mt-8 grid gap-1.5">
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
          </Link>
        );
      })}

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Building2 size={16} className="text-green" />
          Lead Host V1
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Marketplace pay per lead, dati proprietari protetti server-side.
        </p>
      </div>

      <Link
        href="/app/assistenza"
        className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:border-green/30 hover:text-green"
      >
        <Headphones size={16} />
        Supporto
      </Link>
    </nav>
  );
}
