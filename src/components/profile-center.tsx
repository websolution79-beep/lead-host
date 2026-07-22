"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Building2,
  Camera,
  KeyRound,
  ReceiptText,
  UserCircle,
  Wallet,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";

type Profile = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: "active" | "suspended";
};

type WalletRow = {
  id: string;
  balance_cents: number;
  currency: string;
};

type BillingSubjectType = "individual" | "company";

type BillingProfile = {
  id: string;
  profile_id: string;
  subject_type: BillingSubjectType;
  first_name: string | null;
  last_name: string | null;
  fiscal_code: string | null;
  company_name: string | null;
  vat_number: string | null;
  company_fiscal_code: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  country: string;
  sdi_code: string | null;
  pec: string | null;
  invoice_email: string | null;
};

type NewLeadFrequency = "immediate" | "daily" | "every_3_days" | "off";

export function ProfileCenter() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [billingSubjectType, setBillingSubjectType] =
    useState<BillingSubjectType>("individual");
  const [billingFirstName, setBillingFirstName] = useState("");
  const [billingLastName, setBillingLastName] = useState("");
  const [billingFiscalCode, setBillingFiscalCode] = useState("");
  const [billingCompanyName, setBillingCompanyName] = useState("");
  const [billingVatNumber, setBillingVatNumber] = useState("");
  const [billingCompanyFiscalCode, setBillingCompanyFiscalCode] = useState("");
  const [billingAddressLine, setBillingAddressLine] = useState("");
  const [billingPostalCode, setBillingPostalCode] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingProvince, setBillingProvince] = useState("");
  const [billingCountry, setBillingCountry] = useState("IT");
  const [billingSdiCode, setBillingSdiCode] = useState("");
  const [billingPec, setBillingPec] = useState("");
  const [billingInvoiceEmail, setBillingInvoiceEmail] = useState("");
  const [newLeadFrequency, setNewLeadFrequency] =
    useState<NewLeadFrequency>("immediate");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingBilling, setIsSavingBilling] = useState(false);
  const [isSavingEmailPreferences, setIsSavingEmailPreferences] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) return;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id,email,first_name,last_name,phone,avatar_url,status")
        .eq("auth_user_id", user.id)
        .single();

      const typedProfile = profileData as Profile | null;

      if (!typedProfile) return;

      const accessToken = sessionData.session?.access_token;
      const { data: walletData } = await supabase
        .from("wallets")
        .select("id,balance_cents,currency")
        .eq("profile_id", typedProfile.id)
        .maybeSingle();

      const { data: billingData } = await supabase
        .from("billing_profiles")
        .select("*")
        .eq("profile_id", typedProfile.id)
        .maybeSingle();

      const typedWallet = walletData as WalletRow | null;
      const typedBilling = billingData as BillingProfile | null;

      setProfile(typedProfile);
      setWallet(typedWallet);
      setFirstName(typedProfile.first_name ?? "");
      setLastName(typedProfile.last_name ?? "");
      setPhone(typedProfile.phone ?? "");

      if (typedBilling) {
        setBillingSubjectType(typedBilling.subject_type);
        setBillingFirstName(typedBilling.first_name ?? "");
        setBillingLastName(typedBilling.last_name ?? "");
        setBillingFiscalCode(typedBilling.fiscal_code ?? "");
        setBillingCompanyName(typedBilling.company_name ?? "");
        setBillingVatNumber(typedBilling.vat_number ?? "");
        setBillingCompanyFiscalCode(typedBilling.company_fiscal_code ?? "");
        setBillingAddressLine(typedBilling.address_line ?? "");
        setBillingPostalCode(typedBilling.postal_code ?? "");
        setBillingCity(typedBilling.city ?? "");
        setBillingProvince(typedBilling.province ?? "");
        setBillingCountry(typedBilling.country ?? "IT");
        setBillingSdiCode(typedBilling.sdi_code ?? "");
        setBillingPec(typedBilling.pec ?? "");
        setBillingInvoiceEmail(typedBilling.invoice_email ?? "");
      } else {
        setBillingFirstName(typedProfile.first_name ?? "");
        setBillingLastName(typedProfile.last_name ?? "");
        setBillingInvoiceEmail(typedProfile.email);
      }

      if (accessToken) {
        const preferencesResponse = await fetch("/api/notification-preferences", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (preferencesResponse.ok) {
          const result = (await preferencesResponse.json()) as {
            preferences?: {
              newLeadFrequency?: NewLeadFrequency;
            };
          };
          setNewLeadFrequency(result.preferences?.newLeadFrequency ?? "immediate");
        }
      }
    }

    loadProfile();
  }, [supabase]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;

    setError("");
    setStatusMessage("");
    setIsSaving(true);

    const { data, error: updateError } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
      })
      .eq("id", profile.id)
      .select("id,email,first_name,last_name,phone,avatar_url,status")
      .single();

    setIsSaving(false);

    if (updateError || !data) {
      setError("Non sono riuscito ad aggiornare il profilo.");
      return;
    }

    setProfile(data as Profile);
    setStatusMessage("Profilo aggiornato.");
  }

  async function handleBillingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;

    setError("");
    setStatusMessage("");

    const normalizedSdiCode = billingSdiCode.trim().toUpperCase();
    const normalizedPec = billingPec.trim().toLowerCase();

    if (billingSubjectType === "individual") {
      if (
        !billingFirstName.trim() ||
        !billingLastName.trim() ||
        !billingFiscalCode.trim() ||
        !billingAddressLine.trim() ||
        !billingPostalCode.trim() ||
        !billingCity.trim() ||
        !billingProvince.trim()
      ) {
        setError("Per una persona fisica compila nome, cognome, codice fiscale e indirizzo.");
        return;
      }
    }

    if (billingSubjectType === "company") {
      if (
        !billingCompanyName.trim() ||
        !billingVatNumber.trim() ||
        !billingAddressLine.trim() ||
        !billingPostalCode.trim() ||
        !billingCity.trim() ||
        !billingProvince.trim()
      ) {
        setError("Per una societa compila ragione sociale, partita IVA e sede legale.");
        return;
      }

      if (!normalizedSdiCode && !normalizedPec) {
        setError("Per una societa inserisci almeno Codice SDI o PEC.");
        return;
      }
    }

    setIsSavingBilling(true);

    const { error: billingError } = await supabase.from("billing_profiles").upsert(
      {
        profile_id: profile.id,
        subject_type: billingSubjectType,
        first_name: billingSubjectType === "individual" ? billingFirstName.trim() : null,
        last_name: billingSubjectType === "individual" ? billingLastName.trim() : null,
        fiscal_code:
          billingSubjectType === "individual"
            ? billingFiscalCode.trim().toUpperCase()
            : null,
        company_name: billingSubjectType === "company" ? billingCompanyName.trim() : null,
        vat_number:
          billingSubjectType === "company" ? billingVatNumber.trim().toUpperCase() : null,
        company_fiscal_code:
          billingSubjectType === "company"
            ? billingCompanyFiscalCode.trim().toUpperCase() || null
            : null,
        address_line: billingAddressLine.trim(),
        postal_code: billingPostalCode.trim(),
        city: billingCity.trim(),
        province: billingProvince.trim().toUpperCase(),
        country: billingCountry.trim().toUpperCase() || "IT",
        sdi_code: billingSubjectType === "company" ? normalizedSdiCode || null : null,
        pec: billingSubjectType === "company" ? normalizedPec || null : null,
        invoice_email: billingInvoiceEmail.trim().toLowerCase() || profile.email,
      },
      { onConflict: "profile_id" },
    );

    setIsSavingBilling(false);

    if (billingError) {
      setError("Non sono riuscito a salvare i dati di fatturazione.");
      return;
    }

    setStatusMessage("Dati di fatturazione aggiornati.");
  }

  async function handleEmailPreferencesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatusMessage("");
    setIsSavingEmailPreferences(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setIsSavingEmailPreferences(false);
      setError("Sessione non trovata. Effettua di nuovo il login.");
      return;
    }

    const response = await fetch("/api/notification-preferences", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ newLeadFrequency }),
    });

    setIsSavingEmailPreferences(false);

    if (!response.ok) {
      setError("Non sono riuscito a salvare le preferenze email.");
      return;
    }

    setStatusMessage("Preferenze email aggiornate.");
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    if (!profile) return;
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setStatusMessage("");
    setIsUploading(true);

    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${profile.id}/avatar.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-avatars")
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      setIsUploading(false);
      setError("Upload immagine non riuscito. Usa JPG, PNG o WebP sotto 2 MB.");
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("profile-avatars")
      .getPublicUrl(filePath);

    const { data, error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrlData.publicUrl })
      .eq("id", profile.id)
      .select("id,email,first_name,last_name,phone,avatar_url,status")
      .single();

    setIsUploading(false);

    if (updateError || !data) {
      setError("Immagine caricata, ma non salvata nel profilo.");
      return;
    }

    setProfile(data as Profile);
    setStatusMessage("Immagine profilo aggiornata.");
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatusMessage("");

    if (newPassword.length < 8) {
      setError("La nuova password deve avere almeno 8 caratteri.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    const { error: passwordError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (passwordError) {
      setError("Non sono riuscito ad aggiornare la password.");
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setStatusMessage("Password aggiornata.");
  }

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <main className="grid gap-6">
        <section className="card p-6">
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="size-24 rounded-2xl object-cover ring-1 ring-slate-200"
                src={profile.avatar_url}
              />
            ) : (
              <span className="flex size-24 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <UserCircle size={42} />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="section-kicker">Account</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              {displayName || profile?.email || "Profilo"}
            </h2>
            <p className="mt-1 text-sm text-muted">{profile?.email}</p>
            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-green/40 hover:text-green">
              <Camera size={16} />
              {isUploading ? "Carico..." : "Cambia immagine"}
              <input
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarChange}
              />
            </label>
          </div>
        </div>

        {statusMessage ? (
          <p className="mt-5 rounded-lg border border-green/20 bg-green/8 px-4 py-3 text-sm font-semibold text-green">
            {statusMessage}
          </p>
        ) : null}
        {error ? (
          <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleProfileSubmit}>
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Nome
            <input
              className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Cognome
            <input
              className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-ink sm:col-span-2">
            Telefono
            <input
              className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <button className="btn btn-primary sm:col-span-2" disabled={isSaving} type="submit">
            {isSaving ? "Salvataggio..." : "Salva profilo"}
          </button>
        </form>
        </section>

        <section className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="section-kicker">Email e notifiche</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">
                Nuovi lead nel marketplace
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Scegli quando ricevere le email per i nuovi lead pubblicati.
                Le email transazionali importanti, come acquisti e sicurezza,
                restano sempre attive.
              </p>
            </div>
            <span className="flex size-11 items-center justify-center rounded-xl bg-green/10 text-green">
              <BellRing size={22} />
            </span>
          </div>

          <form className="mt-6 grid gap-3" onSubmit={handleEmailPreferencesSubmit}>
            <EmailFrequencyOption
              checked={newLeadFrequency === "immediate"}
              label="Ogni nuovo lead aggiunto"
              description="Ricevi una mail appena un lead viene pubblicato nel marketplace."
              onChange={() => setNewLeadFrequency("immediate")}
            />
            <EmailFrequencyOption
              checked={newLeadFrequency === "daily"}
              label="Riepilogo giornaliero"
              description="Ricevi una mail al giorno con i nuovi lead pubblicati."
              onChange={() => setNewLeadFrequency("daily")}
            />
            <EmailFrequencyOption
              checked={newLeadFrequency === "every_3_days"}
              label="Riepilogo ogni 3 giorni"
              description="Ricevi un riepilogo meno frequente, utile se non vuoi troppe email."
              onChange={() => setNewLeadFrequency("every_3_days")}
            />
            <EmailFrequencyOption
              checked={newLeadFrequency === "off"}
              label="Non ricevere email sui nuovi lead"
              description="Continuerai comunque a ricevere email transazionali importanti."
              onChange={() => setNewLeadFrequency("off")}
            />
            <button
              className="btn btn-primary mt-2"
              disabled={isSavingEmailPreferences}
              type="submit"
            >
              {isSavingEmailPreferences ? "Salvataggio..." : "Salva preferenze email"}
            </button>
          </form>
        </section>

        <section className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="section-kicker">Fatturazione</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">
                Dati di fatturazione
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Servono per emettere correttamente fatture e ricevute relative a ricariche
                wallet e acquisti lead.
              </p>
            </div>
            <span className="flex size-11 items-center justify-center rounded-xl bg-green/10 text-green">
              <ReceiptText size={22} />
            </span>
          </div>

          <form className="mt-6 grid gap-4" onSubmit={handleBillingSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold ${
                  billingSubjectType === "individual"
                    ? "border-green bg-green/10 text-green"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
                type="button"
                onClick={() => setBillingSubjectType("individual")}
              >
                <UserCircle size={17} />
                Persona Fisica
              </button>
              <button
                className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold ${
                  billingSubjectType === "company"
                    ? "border-green bg-green/10 text-green"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
                type="button"
                onClick={() => setBillingSubjectType("company")}
              >
                <Building2 size={17} />
                Societa
              </button>
            </div>

            {billingSubjectType === "individual" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Nome"
                  value={billingFirstName}
                  onChange={setBillingFirstName}
                  required
                />
                <TextField
                  label="Cognome"
                  value={billingLastName}
                  onChange={setBillingLastName}
                  required
                />
                <TextField
                  className="sm:col-span-2"
                  label="Codice fiscale"
                  value={billingFiscalCode}
                  onChange={setBillingFiscalCode}
                  required
                />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  className="sm:col-span-2"
                  label="Ragione sociale"
                  value={billingCompanyName}
                  onChange={setBillingCompanyName}
                  required
                />
                <TextField
                  label="Partita IVA"
                  value={billingVatNumber}
                  onChange={setBillingVatNumber}
                  required
                />
                <TextField
                  label="Codice fiscale societa"
                  value={billingCompanyFiscalCode}
                  onChange={setBillingCompanyFiscalCode}
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                className="sm:col-span-2"
                label={billingSubjectType === "company" ? "Sede legale" : "Indirizzo"}
                value={billingAddressLine}
                onChange={setBillingAddressLine}
                required
              />
              <TextField
                label="CAP"
                value={billingPostalCode}
                onChange={setBillingPostalCode}
                required
              />
              <TextField
                label="Citta"
                value={billingCity}
                onChange={setBillingCity}
                required
              />
              <TextField
                label="Provincia"
                value={billingProvince}
                onChange={setBillingProvince}
                required
              />
              <TextField
                label="Paese"
                value={billingCountry}
                onChange={setBillingCountry}
                required
              />
            </div>

            {billingSubjectType === "company" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Codice SDI"
                  value={billingSdiCode}
                  onChange={setBillingSdiCode}
                  placeholder="7 caratteri"
                />
                <TextField
                  label="PEC"
                  type="email"
                  value={billingPec}
                  onChange={setBillingPec}
                />
              </div>
            ) : null}

            <TextField
              label="Email fatture"
              type="email"
              value={billingInvoiceEmail}
              onChange={setBillingInvoiceEmail}
            />

            {billingSubjectType === "company" ? (
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs leading-5 text-muted">
                Per le societa e richiesto almeno uno tra Codice SDI e PEC.
              </p>
            ) : null}

            <button className="btn btn-primary" disabled={isSavingBilling} type="submit">
              {isSavingBilling ? "Salvataggio..." : "Salva dati fatturazione"}
            </button>
          </form>
        </section>
      </main>

      <aside className="grid gap-6">
        <section className="card p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Wallet size={20} />
            </span>
            <div>
              <h2 className="font-semibold text-ink">Wallet</h2>
              <p className="text-sm text-muted">Saldo disponibile</p>
            </div>
          </div>
          <p className="mt-5 text-3xl font-semibold text-ink">
            {wallet ? formatCurrencyCents(wallet.balance_cents, wallet.currency) : "0,00 EUR"}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Le ricariche wallet e gli acquisti lead verranno riconciliati con Stripe nella fase
            pagamenti.
          </p>
        </section>

        <section className="card p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <KeyRound size={20} />
            </span>
            <h2 className="font-semibold text-ink">Cambio password</h2>
          </div>
          <form className="mt-5 grid gap-3" onSubmit={handlePasswordSubmit}>
            <input
              className="min-h-11 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
              type="password"
              autoComplete="new-password"
              placeholder="Nuova password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <input
              className="min-h-11 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
              type="password"
              autoComplete="new-password"
              placeholder="Conferma password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            <button className="btn btn-secondary" type="submit">
              Aggiorna password
            </button>
          </form>
        </section>
      </aside>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  className = "",
  placeholder,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className={`grid gap-2 text-sm font-semibold text-ink ${className}`}>
      <span>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <input
        className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function EmailFrequencyOption({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
        checked ? "border-green bg-green/8" : "border-slate-200 bg-white"
      }`}
    >
      <input
        className="mt-1 size-4 accent-green"
        type="radio"
        name="newLeadFrequency"
        checked={checked}
        onChange={onChange}
      />
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="mt-1 block text-sm leading-6 text-muted">{description}</span>
      </span>
    </label>
  );
}
