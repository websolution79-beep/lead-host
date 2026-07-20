"use client";

import { useEffect, useMemo, useState } from "react";
import { CirclePause, ShieldCheck, UserCheck, Users } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";

type PropertyManagerRecord = {
  profileId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  profileStatus: "active" | "suspended";
  verificationStatus: "not_verified" | "verified" | "suspended";
  managedPropertiesLabel: string;
  primaryCity: string;
  walletBalanceCents: number;
  walletCurrency: string;
  createdAt: string;
};

const verificationLabels: Record<PropertyManagerRecord["verificationStatus"], string> = {
  not_verified: "Da verificare",
  verified: "Verificato",
  suspended: "Sospeso",
};

export function AdminPropertyManagersConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [records, setRecords] = useState<PropertyManagerRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionProfileId, setActionProfileId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadPropertyManagers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  }

  async function loadPropertyManagers() {
    setIsLoading(true);
    setError("");

    const token = await getAccessToken();

    if (!token) {
      setError("Sessione admin non trovata.");
      setIsLoading(false);
      return;
    }

    const response = await fetch("/api/admin/property-managers", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare i Property Manager.");
      setIsLoading(false);
      return;
    }

    setRecords(payload.propertyManagers ?? []);
    setIsLoading(false);
  }

  async function updatePropertyManager(
    profileId: string,
    update: Partial<
      Pick<PropertyManagerRecord, "profileStatus" | "verificationStatus">
    >,
  ) {
    setActionProfileId(profileId);
    setError("");

    const token = await getAccessToken();

    if (!token) {
      setError("Sessione admin non trovata.");
      setActionProfileId(null);
      return;
    }

    const response = await fetch("/api/admin/property-managers", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ profileId, ...update }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Aggiornamento non riuscito.");
      setActionProfileId(null);
      return;
    }

    await loadPropertyManagers();
    setActionProfileId(null);
  }

  const verifiedCount = records.filter((record) => record.verificationStatus === "verified")
    .length;
  const pendingCount = records.filter(
    (record) => record.verificationStatus === "not_verified",
  ).length;
  const suspendedCount = records.filter(
    (record) =>
      record.verificationStatus === "suspended" || record.profileStatus === "suspended",
  ).length;

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 lg:grid-cols-4">
        <KpiCard icon={Users} label="PM totali" value={records.length.toString()} />
        <KpiCard icon={ShieldCheck} label="Da verificare" value={pendingCount.toString()} />
        <KpiCard icon={UserCheck} label="Verificati" value={verifiedCount.toString()} />
        <KpiCard icon={CirclePause} label="Sospesi" value={suspendedCount.toString()} />
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <p className="section-kicker">Iscrizioni PM</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Property Manager</h2>
          </div>
          <button className="btn btn-secondary" type="button" onClick={loadPropertyManagers}>
            Aggiorna
          </button>
        </div>

        {error ? (
          <p className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-5 py-4 font-semibold">Property Manager</th>
                <th className="px-5 py-4 font-semibold">Citta principale</th>
                <th className="px-5 py-4 font-semibold">Immobili</th>
                <th className="px-5 py-4 font-semibold">Wallet</th>
                <th className="px-5 py-4 font-semibold">Stato</th>
                <th className="px-5 py-4 font-semibold">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td className="px-5 py-8 text-center text-muted" colSpan={6}>
                    Carico Property Manager...
                  </td>
                </tr>
              ) : records.length > 0 ? (
                records.map((record) => {
                  const displayName =
                    [record.firstName, record.lastName].filter(Boolean).join(" ") ||
                    "Senza nome";
                  const isBusy = actionProfileId === record.profileId;

                  return (
                    <tr key={record.profileId} className="align-top">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-ink">{displayName}</p>
                        <p className="mt-1 text-slate-500">{record.email}</p>
                        <p className="mt-1 text-slate-500">{record.phone ?? "Telefono assente"}</p>
                      </td>
                      <td className="px-5 py-4 font-medium text-ink">{record.primaryCity}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {record.managedPropertiesLabel}
                      </td>
                      <td className="px-5 py-4 font-semibold text-ink">
                        {formatCurrencyCents(
                          record.walletBalanceCents,
                          record.walletCurrency,
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            record.verificationStatus === "verified"
                              ? "bg-green/10 text-green"
                              : record.verificationStatus === "suspended" ||
                                  record.profileStatus === "suspended"
                                ? "bg-red-50 text-red-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {record.profileStatus === "suspended"
                            ? "Account sospeso"
                            : verificationLabels[record.verificationStatus]}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="rounded-lg border border-green/20 bg-green/10 px-3 py-2 text-xs font-semibold text-green disabled:opacity-50"
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              updatePropertyManager(record.profileId, {
                                verificationStatus: "verified",
                                profileStatus: "active",
                              })
                            }
                          >
                            Verifica
                          </button>
                          <button
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              updatePropertyManager(record.profileId, {
                                verificationStatus: "suspended",
                                profileStatus: "suspended",
                              })
                            }
                          >
                            Sospendi
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="px-5 py-8 text-center text-muted" colSpan={6}>
                    Nessun Property Manager registrato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <article className="card p-5">
      <span className="flex size-10 items-center justify-center rounded-xl bg-green/10 text-green">
        <Icon size={20} />
      </span>
      <p className="mt-4 text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-sm font-medium text-muted">{label}</p>
    </article>
  );
}
