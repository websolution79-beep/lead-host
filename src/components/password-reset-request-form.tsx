"use client";

import { FormEvent, useMemo, useState } from "react";
import { MailCheck } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

export function PasswordResetRequestForm() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const redirectTo = `${window.location.origin}/auth/callback?next=/reimposta-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo },
    );

    setIsSubmitting(false);

    if (resetError) {
      setError(
        "Non è stato possibile inviare l'email. Attendi qualche minuto e riprova.",
      );
      return;
    }

    setIsSent(true);
  }

  if (isSent) {
    return (
      <div className="mt-7 rounded-xl border border-green/20 bg-green/8 p-5">
        <MailCheck className="text-green" size={28} />
        <h2 className="mt-4 text-xl font-semibold text-ink">Controlla la tua email</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Se esiste un account associato all&apos;indirizzo indicato, riceverai un
          link per scegliere una nuova password. Controlla anche le cartelle
          Promozioni e Spam.
        </p>
      </div>
    );
  }

  return (
    <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
      <label className="grid gap-2 text-sm font-semibold text-ink">
        Email
        <input
          className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
          type="email"
          autoComplete="email"
          placeholder="nome@azienda.it"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Invio in corso..." : "Invia link di recupero"}
      </button>
    </form>
  );
}
