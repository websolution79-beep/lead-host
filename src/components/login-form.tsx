"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { getDefaultRoute, type AppRole } from "@/lib/auth/roles";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createPublicSupabaseClient();
  const isEmailConfirmed = searchParams.get("confirmed") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.user) {
      setError("Email o password non corretti.");
      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      const sessionResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at,
        }),
      });

      if (!sessionResponse.ok) {
        setError("Accesso riuscito, ma non sono riuscito a inizializzare la sessione.");
        setIsSubmitting(false);
        return;
      }

      await fetch("/api/email/welcome", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      });
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", data.user.id)
      .single();
    const profile = profileData as { id: string } | null;

    const { data: rolesData } = profile
      ? await supabase
          .from("user_roles")
          .select("role")
          .eq("profile_id", profile.id)
      : { data: [] };

    const roles = ((rolesData ?? []) as { role: AppRole }[]).map((item) => item.role);
    const redirectTo = searchParams.get("redirect");

    router.push(redirectTo || getDefaultRoute(roles));
    router.refresh();
  }

  return (
    <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
      {isEmailConfirmed ? (
        <p className="rounded-lg border border-green/20 bg-green/8 px-4 py-3 text-sm font-semibold text-green">
          Email confermata. Ora puoi accedere al tuo account.
        </p>
      ) : null}
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
      <label className="grid gap-2 text-sm font-semibold text-ink">
        Password
        <input
          className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary mt-2" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Accesso in corso..." : "Accedi"}
      </button>
    </form>
  );
}
