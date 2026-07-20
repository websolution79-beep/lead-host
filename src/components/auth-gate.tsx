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

type CachedAuth = {
  userId: string;
  profileId: string;
  roles: AppRole[];
  status: "active" | "suspended";
  verifiedAt: number;
};

const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;
const AUTH_CACHE_KEY = "lead-host-auth-cache";
let authCache: CachedAuth | null = null;

export function AuthGate({ children, section }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const cachedState = getStateFromCache(section);

      if (cachedState && isMounted) {
        setState(cachedState);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        clearAuthCache();
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
        clearAuthCache();
        if (isMounted) setState({ status: "forbidden", roles: [] });
        return;
      }

      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("profile_id", profile.id);

      const roles = ((roleRows ?? []) as { role: AppRole }[]).map((item) => item.role);
      const canAccessAdmin = section !== "admin" || hasRole(roles, "super_admin");
      writeAuthCache({
        userId: user.id,
        profileId: profile.id,
        roles,
        status: profile.status,
        verifiedAt: Date.now(),
      });

      if (isMounted) {
        setState(canAccessAdmin ? { status: "authorized" } : { status: "forbidden", roles });
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearAuthCache();
        router.replace("/login");
      }

    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router, section, supabase]);

  if (state.status === "loading") {
    return null;
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
          <Link className="btn btn-primary mt-5" href="/app/marketplace">
            Torna al marketplace
          </Link>
        </div>
      </div>
    );
  }

  return children;
}

function getStateFromCache(section: AuthGateProps["section"]): AuthState | null {
  const cache = readAuthCache();

  if (!cache || cache.status !== "active") {
    return null;
  }

  if (Date.now() - cache.verifiedAt > AUTH_CACHE_TTL_MS) {
    clearAuthCache();
    return null;
  }

  if (section === "admin" && !hasRole(cache.roles, "super_admin")) {
    return { status: "forbidden", roles: cache.roles };
  }

  return { status: "authorized" };
}

function readAuthCache() {
  if (authCache) {
    return authCache;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawCache = window.sessionStorage.getItem(AUTH_CACHE_KEY);

    if (!rawCache) {
      return null;
    }

    authCache = JSON.parse(rawCache) as CachedAuth;

    return authCache;
  } catch {
    clearAuthCache();
    return null;
  }
}

function writeAuthCache(cache: CachedAuth) {
  authCache = cache;

  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(cache));
}

function clearAuthCache() {
  authCache = null;

  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(AUTH_CACHE_KEY);
  }
}
