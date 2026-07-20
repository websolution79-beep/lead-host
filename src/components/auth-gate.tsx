"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { hasRole, type AppRole } from "@/lib/auth/roles";

type AuthGateProps = {
  children: ReactNode;
  section: "pm" | "admin";
};

type AuthState =
  | { status: "loading" }
  | { status: "authorized" }
  | { status: "forbidden"; roles: AppRole[] };

export function AuthGate({ children, section }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id,status")
        .eq("auth_user_id", user.id)
        .single();
      const profile = profileData as { id: string; status: "active" | "suspended" } | null;

      if (!profile || profile.status === "suspended") {
        if (isMounted) setState({ status: "forbidden", roles: [] });
        return;
      }

      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("profile_id", profile.id);

      const roles = ((roleRows ?? []) as { role: AppRole }[]).map((item) => item.role);
      const canAccessAdmin = section !== "admin" || hasRole(roles, "super_admin");

      if (isMounted) {
        setState(canAccessAdmin ? { status: "authorized" } : { status: "forbidden", roles });
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login");
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router, section, supabase]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-5">
        <div className="card max-w-md p-6 text-center">
          <p className="section-kicker">Sessione</p>
          <h1 className="mt-3 text-2xl font-semibold text-ink">Verifico accesso</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Stiamo controllando sessione, profilo e ruoli.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "forbidden") {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-xl items-center px-5">
        <div className="card p-6">
          <p className="section-kicker">Accesso negato</p>
          <h1 className="mt-3 text-2xl font-semibold text-ink">
            Non hai i permessi per questa sezione
          </h1>
          <p className="mt-3 leading-7 text-muted">
            Questa area richiede un profilo attivo e il ruolo corretto. Se pensi sia un
            errore, contatta il Super Admin.
          </p>
          <Link className="btn btn-primary mt-5" href="/app">
            Torna alla dashboard
          </Link>
        </div>
      </div>
    );
  }

  return children;
}
