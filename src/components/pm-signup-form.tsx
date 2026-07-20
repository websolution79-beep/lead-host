"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getManagedPropertiesCount,
  managedPropertiesOptions,
} from "@/lib/domain/pm-onboarding";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

export function PmSignupForm() {
  const router = useRouter();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [managedPropertiesRange, setManagedPropertiesRange] = useState("");
  const [primaryCity, setPrimaryCity] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSubmitting(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          phone,
          managed_properties_range: managedPropertiesRange,
          primary_city: primaryCity,
        },
      },
    });

    if (signUpError) {
      setError("Non sono riuscito a creare l'account. Controlla i dati inseriti.");
      setIsSubmitting(false);
      return;
    }

    if (data.session && data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", data.user.id)
        .single();

      if (profile) {
        const profileId = (profile as { id: string }).id;
        const managedPropertiesCount = getManagedPropertiesCount(managedPropertiesRange);
        const fallbackCompanyName =
          [firstName, lastName].filter(Boolean).join(" ").trim() || email.trim();

        const { error: pmProfileError } = await supabase.from("property_manager_profiles").upsert(
          {
            profile_id: profileId,
            company_name: fallbackCompanyName,
            managed_properties_count: managedPropertiesCount,
            managed_properties_range: managedPropertiesRange,
            primary_city: primaryCity.trim(),
            verification_status: "not_verified",
          },
          { onConflict: "profile_id" },
        );

        if (pmProfileError) {
          await supabase.from("property_manager_profiles").upsert(
            {
              profile_id: profileId,
              company_name: fallbackCompanyName,
              managed_properties_count: managedPropertiesCount,
              verification_status: "not_verified",
            },
            { onConflict: "profile_id" },
          );
        }
      }

      router.push("/app/profilo");
      router.refresh();
      return;
    }

    setMessage(
      "Account creato. Se la conferma email e attiva, apri la mail ricevuta e poi accedi.",
    );
    setIsSubmitting(false);
  }

  return (
    <form className="card grid gap-4 p-6" onSubmit={handleSubmit}>
      <div>
        <p className="section-kicker">Registrazione gratuita</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">Crea account PM</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
          placeholder="Nome"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          required
        />
        <input
          className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
          placeholder="Cognome"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          required
        />
      </div>
      <input
        className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <input
        className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
        placeholder="Telefono"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        required
      />
      <label className="grid gap-2 text-sm font-semibold text-ink">
        Gestisci gia immobili?
        <select
          className="min-h-12 rounded-lg border border-ink/12 bg-white px-4 outline-none focus:border-green"
          value={managedPropertiesRange}
          onChange={(event) => setManagedPropertiesRange(event.target.value)}
          required
        >
          <option value="">Seleziona una risposta</option>
          {managedPropertiesOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <input
        className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
        placeholder="Citta principale"
        value={primaryCity}
        onChange={(event) => setPrimaryCity(event.target.value)}
        required
      />
      <input
        className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
        type="password"
        autoComplete="new-password"
        placeholder="Password"
        value={password}
        minLength={8}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {message ? (
        <p className="rounded-lg border border-green/20 bg-green/8 px-4 py-3 text-sm font-semibold text-green">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Creazione..." : "Registrati gratis"}
      </button>
    </form>
  );
}
