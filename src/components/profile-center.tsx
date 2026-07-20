"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { Camera, KeyRound, ShieldCheck, UserCircle, Wallet } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents, type AppRole } from "@/lib/auth/roles";

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

export function ProfileCenter() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
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

      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("profile_id", typedProfile.id);

      const { data: walletData } = await supabase
        .from("wallets")
        .select("id,balance_cents,currency")
        .eq("profile_id", typedProfile.id)
        .maybeSingle();

      const typedWallet = walletData as WalletRow | null;

      setProfile(typedProfile);
      setRoles(((roleRows ?? []) as { role: AppRole }[]).map((item) => item.role));
      setWallet(typedWallet);
      setFirstName(typedProfile.first_name ?? "");
      setLastName(typedProfile.last_name ?? "");
      setPhone(typedProfile.phone ?? "");
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

      <aside className="grid gap-6">
        <section className="card p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-green/10 text-green">
              <ShieldCheck size={20} />
            </span>
            <div>
              <h2 className="font-semibold text-ink">Ruoli e stato</h2>
              <p className="text-sm text-muted">{profile?.status === "active" ? "Attivo" : "Sospeso"}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {roles.map((role) => (
              <span
                key={role}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                {role === "super_admin" ? "Super Admin" : "Property Manager"}
              </span>
            ))}
          </div>
        </section>

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
