"use client";

import Link from "next/link";
import { ArrowLeftRight, BriefcaseBusiness, ShieldCheck } from "lucide-react";
import { useAppSession } from "@/components/app-session-provider";

type RoleSwitcherProps = {
  section: "pm" | "admin";
};

export function RoleSwitcher({ section }: RoleSwitcherProps) {
  const { roles } = useAppSession();

  const canSwitchToAdmin = section === "pm" && roles.includes("super_admin");
  const canSwitchToPm = section === "admin" && roles.includes("property_manager");
  const target = canSwitchToAdmin
    ? { href: "/admin", label: "Vai ad Admin", icon: ShieldCheck }
    : canSwitchToPm
      ? { href: "/app/marketplace", label: "Vai a Property Manager", icon: BriefcaseBusiness }
      : null;

  if (!target) return null;

  const Icon = target.icon;

  return (
    <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ArrowLeftRight size={16} className="text-green" />
        Modalita
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        Hai piu ruoli attivi. Cambia area senza mischiare i menu.
      </p>
      <Link
        href={target.href}
        className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-lg bg-green px-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(4,120,87,0.18)] hover:bg-green-dark"
      >
        <Icon size={16} />
        {target.label}
      </Link>
    </div>
  );
}
