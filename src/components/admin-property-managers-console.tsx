"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CirclePause,
  Eye,
  Mail,
  ReceiptText,
  ShieldCheck,
  UserCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";

type PropertyManagerRecord = {
  profileId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  profileStatus: "active" | "suspended";
  verificationStatus: "not_verified" | "verified" | "suspended";
  managedPropertiesRange: string | null;
  managedPropertiesLabel: string;
  primaryCity: string;
  companyName: string | null;
  vatNumber: string | null;
  website: string | null;
  managedPropertiesCount: number | null;
  yearsExperience: number | null;
  businessDescription: string | null;
  operatingModel: string | null;
  walletBalanceCents: number;
  walletCurrency: string;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  updatedAt: string;
  propertyManagerCreatedAt: string | null;
  propertyManagerUpdatedAt: string | null;
  billingProfile: {
    subjectType: "individual" | "company";
    firstName: string | null;
    lastName: string | null;
    fiscalCode: string | null;
    companyName: string | null;
    vatNumber: string | null;
    companyFiscalCode: string | null;
    addressLine: string | null;
    postalCode: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
    sdiCode: string | null;
    pec: string | null;
    invoiceEmail: string | null;
    updatedAt: string;
  } | null;
  stats: {
    purchasesCount: number;
    exclusivePurchasesCount: number;
    sharedPurchasesCount: number;
    totalSpentCents: number;
    reportsCount: number;
    openReportsCount: number;
  };
};

const verificationLabels: Record<PropertyManagerRecord["verificationStatus"], string> = {
  not_verified: "Da verificare",
  verified: "Verificato",
  suspended: "Sospeso",
};

export function AdminPropertyManagersConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [records, setRecords] = useState<PropertyManagerRecord[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
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
    setSelectedProfileId((current) => {
      if (current && payload.propertyManagers?.some(
        (record: PropertyManagerRecord) => record.profileId === current,
      )) {
        return current;
      }

      return payload.propertyManagers?.[0]?.profileId ?? null;
    });
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
  const selectedRecord =
    records.find((record) => record.profileId === selectedProfileId) ?? records[0] ?? null;

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
                  const isSelected = selectedRecord?.profileId === record.profileId;

                  return (
                    <tr
                      key={record.profileId}
                      className={`align-top transition ${
                        isSelected ? "bg-green/5" : "hover:bg-slate-50"
                      }`}
                    >
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
                            className={`rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                              isSelected
                                ? "border-green bg-green/10 text-green"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                            type="button"
                            onClick={() => setSelectedProfileId(record.profileId)}
                          >
                            <Eye size={14} className="inline-block" /> Dettaglio
                          </button>
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

      {selectedRecord ? (
        <PropertyManagerDetail
          record={selectedRecord}
          isBusy={actionProfileId === selectedRecord.profileId}
          onVerify={() =>
            updatePropertyManager(selectedRecord.profileId, {
              verificationStatus: "verified",
              profileStatus: "active",
            })
          }
          onSuspend={() =>
            updatePropertyManager(selectedRecord.profileId, {
              verificationStatus: "suspended",
              profileStatus: "suspended",
            })
          }
        />
      ) : null}
    </div>
  );
}

function PropertyManagerDetail({
  record,
  isBusy,
  onVerify,
  onSuspend,
}: {
  record: PropertyManagerRecord;
  isBusy: boolean;
  onVerify: () => void;
  onSuspend: () => void;
}) {
  const displayName =
    [record.firstName, record.lastName].filter(Boolean).join(" ") || "Senza nome";
  const billing = record.billingProfile;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-200 p-6">
        <div className="flex min-w-0 items-start gap-4">
          {record.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="size-16 shrink-0 rounded-2xl object-cover ring-1 ring-slate-200"
              src={record.avatarUrl}
            />
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Users size={28} />
            </span>
          )}
          <div className="min-w-0">
            <p className="section-kicker">Scheda PM</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{displayName}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge record={record} />
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                Iscritto il {formatDate(record.createdAt)}
              </span>
              {record.emailConfirmedAt ? (
                <span className="rounded-full bg-green/10 px-3 py-1 text-xs font-semibold text-green">
                  Email confermata
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  Email non confermata
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-green/20 bg-green/10 px-4 py-2 text-sm font-semibold text-green disabled:opacity-50"
            type="button"
            disabled={isBusy}
            onClick={onVerify}
          >
            Verifica PM
          </button>
          <button
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
            type="button"
            disabled={isBusy}
            onClick={onSuspend}
          >
            Sospendi
          </button>
        </div>
      </div>

      <div className="grid gap-6 p-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="grid gap-6">
          <DetailSection icon={Mail} title="Contatti e account">
            <DetailGrid
              items={[
                ["Nome", record.firstName],
                ["Cognome", record.lastName],
                ["Email", record.email],
                ["Telefono", record.phone],
                ["Ultimo accesso", formatNullableDate(record.lastSignInAt)],
                ["Ultimo aggiornamento profilo", formatNullableDate(record.updatedAt)],
              ]}
            />
          </DetailSection>

          <DetailSection icon={Building2} title="Dati professionali">
            <DetailGrid
              items={[
                ["Citta principale", record.primaryCity],
                ["Immobili gestiti", record.managedPropertiesLabel],
                ["Numero immobili", formatNullableNumber(record.managedPropertiesCount)],
                ["Anni esperienza", formatNullableNumber(record.yearsExperience)],
                ["Azienda", record.companyName],
                ["Partita IVA", record.vatNumber],
                ["Sito web", record.website],
                ["Modello operativo", record.operatingModel],
              ]}
            />
            {record.businessDescription ? (
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Descrizione attivita
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {record.businessDescription}
                </p>
              </div>
            ) : null}
          </DetailSection>
        </div>

        <div className="grid gap-6">
          <DetailSection icon={WalletCards} title="Wallet e attivita">
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                label="Saldo wallet"
                value={formatCurrencyCents(record.walletBalanceCents, record.walletCurrency)}
              />
              <MetricTile
                label="Speso in lead"
                value={formatCurrencyCents(record.stats.totalSpentCents, record.walletCurrency)}
              />
              <MetricTile label="Lead acquistati" value={record.stats.purchasesCount} />
              <MetricTile label="Esclusive" value={record.stats.exclusivePurchasesCount} />
              <MetricTile label="Condivisi" value={record.stats.sharedPurchasesCount} />
              <MetricTile label="Segnalazioni aperte" value={record.stats.openReportsCount} />
            </div>
          </DetailSection>

          <DetailSection icon={ReceiptText} title="Dati fatturazione">
            {billing ? (
              <>
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {billing.subjectType === "company" ? "Societa" : "Persona fisica"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    Aggiornati il {formatDate(billing.updatedAt)}
                  </span>
                </div>
                {billing.subjectType === "company" ? (
                  <DetailGrid
                    items={[
                      ["Ragione sociale", billing.companyName],
                      ["Partita IVA", billing.vatNumber],
                      ["Codice fiscale societa", billing.companyFiscalCode],
                      ["Sede legale", formatAddress(billing)],
                      ["Codice SDI", billing.sdiCode],
                      ["PEC", billing.pec],
                      ["Email fatture", billing.invoiceEmail],
                    ]}
                  />
                ) : (
                  <DetailGrid
                    items={[
                      ["Nome", billing.firstName],
                      ["Cognome", billing.lastName],
                      ["Codice fiscale", billing.fiscalCode],
                      ["Indirizzo", formatAddress(billing)],
                      ["Email fatture", billing.invoiceEmail],
                    ]}
                  />
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5">
                <p className="font-semibold text-ink">Dati non compilati</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Il PM non ha ancora salvato i dati di fatturazione nel profilo.
                </p>
              </div>
            )}
          </DetailSection>
        </div>
      </div>
    </section>
  );
}

function DetailSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Users;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-green/10 text-green">
          <Icon size={20} />
        </span>
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function DetailGrid({ items }: { items: Array<[string, string | number | null | undefined]> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-slate-50 p-4">
          <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            {label}
          </dt>
          <dd className="mt-2 break-words text-sm font-semibold text-ink">
            {value || "Non indicato"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function StatusBadge({ record }: { record: PropertyManagerRecord }) {
  const isSuspended =
    record.profileStatus === "suspended" || record.verificationStatus === "suspended";
  const className = isSuspended
    ? "bg-red-50 text-red-700"
    : record.verificationStatus === "verified"
      ? "bg-green/10 text-green"
      : "bg-slate-100 text-slate-600";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>
      {record.profileStatus === "suspended"
        ? "Account sospeso"
        : verificationLabels[record.verificationStatus]}
    </span>
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatNullableDate(value: string | null | undefined) {
  if (!value) return "Non disponibile";

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatNullableNumber(value: number | null | undefined) {
  return typeof value === "number" ? value.toString() : "Non indicato";
}

function formatAddress(
  billing: NonNullable<PropertyManagerRecord["billingProfile"]>,
) {
  return [
    billing.addressLine,
    billing.postalCode,
    billing.city,
    billing.province,
    billing.country,
  ]
    .filter(Boolean)
    .join(", ");
}
