"use client";

import { useEffect, useMemo, useState } from "react";
import { LogOut, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type ProfileSummary = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

export function AccountSummary() {
  const router = useRouter();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("email,first_name,last_name,avatar_url")
        .eq("auth_user_id", user.id)
        .single();

      if (data) setProfile(data);
    }

    loadProfile();
  }, [supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");

  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-3">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="size-10 rounded-full object-cover ring-1 ring-slate-200"
            src={profile.avatar_url}
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
          <p className="truncate text-xs text-slate-500">{profile?.email}</p>
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
