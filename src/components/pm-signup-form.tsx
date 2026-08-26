"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { managedPropertiesOptions } from "@/lib/domain/pm-onboarding";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import {
  dispatchBrowserTrackingEvent,
  getBrowserTrackingConsentSnapshot,
} from "@/lib/tracking/browser-events";

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
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [emailMarketingConsent, setEmailMarketingConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<
    "loading" | "open" | "closed"
  >("loading");

  useEffect(() => {
    let active = true;

    async function loadRegistrationStatus() {
      const response = await fetch("/api/registration/pm", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        open?: boolean;
      };

      if (!active) return;
      setRegistrationStatus(response.ok && payload.open === false ? "closed" : "open");
    }

    void loadRegistrationStatus();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSubmitting(true);
    const trackingConsent = getBrowserTrackingConsentSnapshot();

    const registrationResponse = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        phone,
        managedPropertiesRange,
        primaryCity,
        password,
        legalAccepted,
        emailMarketingConsent,
        trackingConsent,
      }),
    });
    const registrationPayload = (await registrationResponse.json()) as {
      code?: string;
      error?: string;
      trackingEventId?: string | null;
      session?: {
        accessToken: string;
        refreshToken: string;
        expiresAt: number | null;
      } | null;
    };

    if (!registrationResponse.ok) {
      if (registrationPayload.code === "pm_registrations_closed") {
        setRegistrationStatus("closed");
      } else {
        setError(
          registrationPayload.error ??
            "Non sono riuscito a creare l'account. Controlla i dati inseriti.",
        );
      }
      setIsSubmitting(false);
      return;
    }

    dispatchBrowserTrackingEvent("lead", {
      eventId: registrationPayload.trackingEventId,
    });

    if (registrationPayload.session) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: registrationPayload.session.accessToken,
        refresh_token: registrationPayload.session.refreshToken,
      });

      if (sessionError) {
        setError("Account creato, ma non sono riuscito a inizializzare la sessione.");
        setIsSubmitting(false);
        return;
      }

      const sessionResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: registrationPayload.session.accessToken,
          refreshToken: registrationPayload.session.refreshToken,
          expiresAt: registrationPayload.session.expiresAt,
        }),
      });

      if (!sessionResponse.ok) {
        setError("Account creato, ma non sono riuscito a inizializzare la sessione.");
        setIsSubmitting(false);
        return;
      }

      const welcomeResponse = await fetch("/api/email/welcome", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${registrationPayload.session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackingConsent: getBrowserTrackingConsentSnapshot(),
        }),
      });
      const welcomePayload = (await welcomeResponse.json().catch(() => ({}))) as {
        trackingEventId?: string | null;
      };

      dispatchBrowserTrackingEvent("complete_registration", {
        eventId: welcomePayload.trackingEventId,
      });

      router.push("/app/profilo");
      router.refresh();
      return;
    }

    router.push("/registrazione-completata?check_email=1");
    setIsSubmitting(false);
  }

  if (registrationStatus === "loading") {
    return (
      <div className="card flex min-h-72 items-center justify-center p-6 text-center">
        <p className="font-semibold text-muted">Verifico le iscrizioni disponibili...</p>
      </div>
    );
  }

  if (registrationStatus === "closed") {
    return (
      <div className="card grid min-h-72 content-center gap-5 border-red-200 p-6">
        <div>
          <p className="section-kicker">Iscrizioni Property Manager</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            Iscrizioni momentaneamente chiuse
          </h2>
          <p className="mt-4 text-base leading-7 text-muted">
            Le iscrizioni a Lead Host sono momentaneamente chiuse. Entra nel{" "}
            <Link
              className="font-bold text-green underline decoration-green/30 underline-offset-4"
              href="https://t.me/+nZiF2verYaUzNzg0"
              target="_blank"
              rel="noreferrer"
            >
              canale ufficiale Telegram
            </Link>{" "}
            per scoprire quando potrai accedere.
          </p>
        </div>
        <Link
          className="btn btn-primary w-full"
          href="https://t.me/+nZiF2verYaUzNzg0"
          target="_blank"
          rel="noreferrer"
        >
          Entra nel canale Telegram
        </Link>
      </div>
    );
  }

  return (
    <form className="card grid gap-4 p-6" onSubmit={handleSubmit}>
      <div>
        <p className="section-kicker">Registrazione gratuita</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">
          Crea il tuo account gratuito
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Nessun abbonamento obbligatorio. Potrai consultare le opportunità
          prima di sbloccare qualsiasi contatto.
        </p>
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
        Gestisci già immobili?
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
        placeholder="Città principale"
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
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <input
          className="mt-1 size-4 shrink-0 accent-green"
          type="checkbox"
          checked={legalAccepted}
          onChange={(event) => setLegalAccepted(event.target.checked)}
          required
        />
        <span className="text-sm leading-6 text-slate-700">
          Dichiaro di aver letto l&apos;{" "}
          <Link
            className="font-semibold text-green underline decoration-green/30 underline-offset-4"
            href="https://www.iubenda.com/privacy-policy/12644511"
            target="_blank"
            rel="noreferrer"
          >
            Informativa Privacy
          </Link>{" "}
          e accetto i{" "}
          <Link
            className="font-semibold text-green underline decoration-green/30 underline-offset-4"
            href="/termini"
            target="_blank"
            rel="noreferrer"
          >
            Termini e Condizioni
          </Link>
          .
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <input
          className="mt-1 size-4 shrink-0 accent-green"
          type="checkbox"
          checked={emailMarketingConsent}
          onChange={(event) => setEmailMarketingConsent(event.target.checked)}
        />
        <span className="text-sm leading-6 text-slate-700">
          Acconsento a ricevere via email aggiornamenti sulle nuove opportunità
          pubblicate, novità e contenuti gratuiti da Lead Host.
          <span className="mt-1 block text-xs text-muted">
            Puoi modificare questa preferenza in qualsiasi momento dal tuo profilo.
          </span>
        </span>
      </label>
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
