"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [message, setMessage] = useState("Stiamo confermando il tuo account...");
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function completeAuth() {
      const code = searchParams.get("code");
      const requestedNext = searchParams.get("next") || "/registrazione-completata?confirmed=1";
      const next =
        requestedNext.startsWith("/") && !requestedNext.startsWith("//")
          ? requestedNext
          : "/registrazione-completata?confirmed=1";
      const isPasswordRecovery = next === "/reimposta-password";

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error && isMounted) {
          setMessage(
            isPasswordRecovery
              ? "Il link per reimpostare la password non è più valido. Richiedine uno nuovo."
              : "Il link di conferma non è più valido. Prova ad accedere o richiedi una nuova email.",
          );
          setIsBlocked(true);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        if (isMounted) {
          setMessage(
            isPasswordRecovery
              ? "Il link non è più valido. Richiedi una nuova email per reimpostare la password."
              : "Email confermata. Ora puoi accedere con le tue credenziali.",
          );
          setIsBlocked(true);
        }
        return;
      }

      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: session.expires_at,
        }),
      });

      if (!isPasswordRecovery) {
        await fetch("/api/email/welcome", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
      }

      router.replace(next);
      router.refresh();
    }

    completeAuth();

    return () => {
      isMounted = false;
    };
  }, [router, searchParams, supabase]);

  return (
    <div className="card mx-auto max-w-md p-6 text-center sm:p-8">
      <p className="section-kicker">Accesso sicuro</p>
      <h1 className="mt-3 text-3xl font-semibold text-ink">Verifica del link</h1>
      <p className="mt-4 text-sm leading-6 text-muted">{message}</p>
      {isBlocked ? (
        <Link className="btn btn-primary mt-6 w-full" href="/login">
          Vai al login
        </Link>
      ) : null}
    </div>
  );
}
