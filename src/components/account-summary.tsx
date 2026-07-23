"use client";

import { useMemo } from "react";
import { LogOut, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppSession } from "@/components/app-session-provider";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

export function AccountSummary() {
  const router = useRouter();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const session = useAppSession();

  async function handleLogout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const displayName = [session.firstName, session.lastName].filter(Boolean).join(" ");

  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-3">
        {session.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="size-10 rounded-full object-cover ring-1 ring-slate-200"
            src={session.avatarUrl}
          />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <UserCircle size={22} />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {displayName || "Profilo Lead Host"}
          </p>
          <p className="truncate text-xs text-slate-500">{session.email}</p>
        </div>
      </div>
      <button
        className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
        type="button"
        onClick={handleLogout}
      >
        <LogOut size={16} />
        Esci
      </button>
    </div>
  );
}
