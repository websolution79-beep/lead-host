"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

export function PasswordUpdateForm({ minimumLength = 8 }: { minimumLength?: number }) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isChecking, setIsChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setHasSession(Boolean(data.session));
      setIsChecking(false);
    });

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < minimumLength) {
      setError(`La password deve contenere almeno ${minimumLength} caratteri.`);
      return;
    }

    if (password !== confirmation) {
      setError("Le password non coincidono.");
      return;
    }

    setIsSubmitting(true);
    const { data: sessionData } = await supabase.auth.getSession();
    let handledByTeamRoute = false;

    if (sessionData.session) {
      const teamResponse = await fetch("/api/auth/team-password", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      const teamPayload = (await teamResponse.json().catch(() => ({}))) as {
        handled?: boolean;
        error?: string;
      };

      if (!teamResponse.ok) {
        setIsSubmitting(false);
        setError(
          teamPayload.error ??
            "Non è stato possibile aggiornare la password. Riprova.",
        );
        return;
      }

      handledByTeamRoute = teamPayload.handled === true;
    }

    if (!handledByTeamRoute) {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setIsSubmitting(false);
        setError(
          "Non è stato possibile aggiornare la password. Richiedi un nuovo link e riprova.",
        );
        return;
      }
    }

    await fetch("/api/auth/session", { method: "DELETE" });
    await supabase.auth.signOut();
    setIsSubmitting(false);
    setIsComplete(true);
  }

  if (isChecking) {
    return <p className="mt-7 text-sm text-muted">Verifica del link in corso...</p>;
  }

  if (isComplete) {
    return (
      <div className="mt-7">
        <CheckCircle2 className="text-green" size={30} />
        <h2 className="mt-4 text-xl font-semibold text-ink">Password aggiornata</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Ora puoi accedere con la nuova password.
        </p>
        <Link className="btn btn-primary mt-5 w-full" href="/login">
          Vai al login
        </Link>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="mt-7 rounded-xl border border-red-200 bg-red-50 p-5">
        <p className="text-sm font-semibold text-red-700">
          Il link non è valido o è scaduto.
        </p>
        <Link
          className="mt-4 inline-flex text-sm font-semibold text-green hover:underline"
          href="/password-dimenticata"
        >
          Richiedi un nuovo link
        </Link>
      </div>
    );
  }

  return (
    <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
      <label className="grid gap-2 text-sm font-semibold text-ink">
        Nuova password
        <input
          className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
          type="password"
          autoComplete="new-password"
          minLength={minimumLength}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-ink">
        Conferma nuova password
        <input
          className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
          type="password"
          autoComplete="new-password"
          minLength={minimumLength}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          required
        />
      </label>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Aggiornamento..." : "Salva nuova password"}
      </button>
    </form>
  );
}
