"use client";

import Link from "next/link";
import { ArrowLeftRight, BriefcaseBusiness, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/auth/roles";

type RoleSwitcherProps = {
  section: "pm" | "admin";
};

export function RoleSwitcher({ section }: RoleSwitcherProps) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [roles, setRoles] = useState<AppRole[]>([]);

  useEffect(() => {
    async function loadRoles() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) return;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      const profile = profileData as { id: string } | null;

      if (!profile) return;

      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("profile_id", profile.id);

      setRoles(((roleRows ?? []) as { role: AppRole }[]).map((item) => item.role));
    }

    loadRoles();
  }, [supabase]);

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
