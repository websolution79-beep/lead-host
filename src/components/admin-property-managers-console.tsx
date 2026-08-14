"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Building2,
  CirclePause,
  Eye,
  Filter,
  Gift,
  Mail,
  ReceiptText,
  Search,
  ShoppingBag,
  UserCheck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";
import {
  PaginationControls,
  type PaginationState,
} from "@/components/pagination-controls";
import {
  managedPropertiesOptions,
  type ManagedPropertiesRange,
} from "@/lib/domain/pm-onboarding";
import { AdminCustomerAnalysis } from "@/components/admin-customer-analysis";
import { useAppSession } from "@/components/app-session-provider";

type ManagedPropertiesFilter = "" | ManagedPropertiesRange | "not_indicated";

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
  signupData: {
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    managedPropertiesRange: string | null;
    managedPropertiesLabel: string;
    primaryCity: string | null;
    passwordStatus: string;
  };
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
  walletTransactions: Array<{
    id: string;
    type: "top_up" | "lead_purchase" | "refund" | "adjustment";
    status: "pending" | "completed" | "failed" | "cancelled";
    amountCents: number;
    balanceAfterCents: number | null;
    description: string | null;
    provider: string | null;
    providerReference: string | null;
    stripePaymentId: string | null;
    stripeCheckoutSessionId: string | null;
    leadPurchaseId: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
  leadPurchases: Array<{
    id: string;
    leadTitle: string;
    mode: "shared" | "exclusive";
    status: string;
    amountCents: number;
    createdAt: string;
  }>;
  stats: {
    purchasesCount: number;
    exclusivePurchasesCount: number;
    sharedPurchasesCount: number;
    totalSpentCents: number;
    reportsCount: number;
    openReportsCount: number;
  };
};

export function AdminPropertyManagersConsole() {
  const session = useAppSession();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [records, setRecords] = useState<PropertyManagerRecord[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<PropertyManagerRecord | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [actionProfileId, setActionProfileId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [managedPropertiesFilter, setManagedPropertiesFilter] =
    useState<ManagedPropertiesFilter>("");
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    suspended: 0,
  });
  const [activeView, setActiveView] = useState<"directory" | "analysis">("directory");
  const [bonusTarget, setBonusTarget] = useState<PropertyManagerRecord | null>(null);
  const [isBonusSaving, setIsBonusSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPropertyManagers(
        page,
        debouncedSearchTerm,
        managedPropertiesFilter,
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearchTerm, managedPropertiesFilter]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearchTerm(searchTerm.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  }

  async function loadPropertyManagers(
    targetPage = page,
    search = debouncedSearchTerm,
    managedProperties = managedPropertiesFilter,
  ) {
    setIsLoading(true);
    setError("");

    const token = await getAccessToken();

    if (!token) {
      setError("Sessione admin non trovata.");
      setIsLoading(false);
      return;
    }

    const query = new URLSearchParams({
      page: String(targetPage),
      pageSize: "25",
    });
    if (search) query.set("search", search);
    if (managedProperties) {
      query.set("managedProperties", managedProperties);
    }

    const response = await fetch(
      `/api/admin/property-managers?${query.toString()}`,
      {
      headers: { Authorization: `Bearer ${token}` },
      },
    );
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare i Property Manager.");
      setIsLoading(false);
      return;
    }

    setRecords(payload.propertyManagers ?? []);
    setPagination(
      payload.pagination ?? {
        page: targetPage,
        pageSize: 25,
        total: payload.propertyManagers?.length ?? 0,
        totalPages: 1,
      },
    );
    setStats(
      payload.stats ?? {
        total: payload.propertyManagers?.length ?? 0,
        active: payload.propertyManagers?.length ?? 0,
        suspended: 0,
      },
    );
    setIsLoading(false);
  }

  async function openPropertyManager(profileId: string) {
    setSelectedProfileId(profileId);
    setSelectedRecord(null);
    setIsDetailLoading(true);
    setError("");

    const token = await getAccessToken();

    if (!token) {
      setError("Sessione admin non trovata.");
      setIsDetailLoading(false);
      return;
    }

    const response = await fetch(
      `/api/admin/property-managers?profileId=${encodeURIComponent(profileId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const payload = await response.json();

    if (!response.ok || !payload.propertyManagers?.[0]) {
      setError(payload.error ?? "Non riesco a caricare il dettaglio del Property Manager.");
      setSelectedProfileId(null);
      setIsDetailLoading(false);
      return;
    }

    setSelectedRecord(payload.propertyManagers[0]);
    setIsDetailLoading(false);
  }

  async function updatePropertyManager(
    profileId: string,
    action: "suspend" | "reactivate",
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
      body: JSON.stringify({ profileId, action }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Aggiornamento non riuscito.");
      setActionProfileId(null);
      return;
    }

    await loadPropertyManagers(page);
    if (selectedProfileId === profileId) {
      await openPropertyManager(profileId);
    }
    setActionProfileId(null);
  }

  async function grantWalletBonus(input: {
    profileId: string;
    amountCents: number;
    reason: string;
    internalNote: string;
    operationId: string;
  }) {
    setIsBonusSaving(true);
    setError("");
    setNotice("");

    const token = await getAccessToken();
    if (!token) {
      setIsBonusSaving(false);
      return "Sessione Super Admin non trovata.";
    }

    try {
      const response = await fetch("/api/admin/property-managers/bonus", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const payload = await response.json();

      if (!response.ok) {
        return payload.error ?? "Non sono riuscito ad accreditare il bonus Wallet.";
      }

      const targetName = bonusTarget
        ? [bonusTarget.firstName, bonusTarget.lastName].filter(Boolean).join(" ") ||
          bonusTarget.email
        : "Property Manager";
      setBonusTarget(null);
      setNotice(
        `Bonus di ${formatCurrencyCents(payload.amountCents, "eur")} accreditato a ${targetName}.`,
      );
      await openPropertyManager(input.profileId);
      return null;
    } catch {
      return "Connessione non disponibile. Riprova tra poco.";
    } finally {
      setIsBonusSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="card flex flex-wrap gap-2 p-2">
        <button
          type="button"
          onClick={() => setActiveView("directory")}
          className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${activeView === "directory" ? "bg-green text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Elenco PM
        </button>
        <button
          type="button"
          onClick={() => setActiveView("analysis")}
          className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${activeView === "analysis" ? "bg-green text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Analisi clienti
        </button>
      </section>

      {activeView === "analysis" ? (
        <AdminCustomerAnalysis
          onOpenDetail={(profileId) => {
            setActiveView("directory");
            void openPropertyManager(profileId);
          }}
        />
      ) : (
        <>
      <section className="grid gap-3 lg:grid-cols-3">
        <KpiCard icon={Users} label="PM totali" value={stats.total.toString()} />
        <KpiCard icon={UserCheck} label="Attivi" value={stats.active.toString()} />
        <KpiCard icon={CirclePause} label="Sospesi" value={stats.suspended.toString()} />
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <p className="section-kicker">Iscrizioni PM</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Property Manager</h2>
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => loadPropertyManagers(page)}
          >
            Aggiorna
          </button>
        </div>

        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)_auto] lg:items-end">
            <label className="block min-w-0">
              <span className="mb-2 block text-sm font-semibold text-ink">
                Cerca Property Manager
              </span>
              <span className="relative block">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
                />
                <input
                  className="min-h-12 w-full rounded-lg border border-slate-200 bg-white py-3 pl-12 pr-12 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-green focus:ring-2 focus:ring-green/15"
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Nome, email, telefono o città principale"
                  aria-label="Cerca Property Manager per nome, email, telefono o città principale"
                />
                {searchTerm ? (
                  <button
                    className="absolute right-2 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-ink"
                    type="button"
                    onClick={() => setSearchTerm("")}
                    aria-label="Cancella ricerca"
                    title="Cancella ricerca"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                ) : null}
              </span>
            </label>

            <label className="block min-w-0">
              <span className="mb-2 block text-sm font-semibold text-ink">
                Immobili gestiti
              </span>
              <span className="relative block">
                <Filter
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
                />
                <select
                  className="min-h-12 w-full appearance-none rounded-lg border border-slate-200 bg-white py-3 pl-12 pr-10 text-sm font-semibold text-ink outline-none transition focus:border-green focus:ring-2 focus:ring-green/15"
                  value={managedPropertiesFilter}
                  onChange={(event) => {
                    setPage(1);
                    setManagedPropertiesFilter(
                      event.target.value as ManagedPropertiesFilter,
                    );
                  }}
                  aria-label="Filtra Property Manager per immobili gestiti"
                >
                  <option value="">Tutti</option>
                  {managedPropertiesOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  <option value="not_indicated">Non indicato</option>
                </select>
              </span>
            </label>

            <button
              className="btn btn-secondary min-h-12 w-full lg:w-auto"
              type="button"
              disabled={!searchTerm && !managedPropertiesFilter}
              onClick={() => {
                setSearchTerm("");
                setDebouncedSearchTerm("");
                setManagedPropertiesFilter("");
                setPage(1);
              }}
            >
              Reset
            </button>
          </div>
        </div>

        {error ? (
          <p className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="m-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {notice}
          </p>
        ) : null}

        {isDetailLoading ? (
          <div className="flex min-h-[320px] items-center justify-center p-6 text-sm font-semibold text-muted">
            Carico il dettaglio del Property Manager...
          </div>
        ) : selectedRecord ? (
          <div className="p-4 md:p-6">
            <PropertyManagerDetail
              record={selectedRecord}
              isBusy={
                actionProfileId === selectedRecord.profileId ||
                (isBonusSaving && bonusTarget?.profileId === selectedRecord.profileId)
              }
              canGrantBonus={Boolean(session.isSuperAdmin)}
              onGrantBonus={() => {
                setNotice("");
                setBonusTarget(selectedRecord);
              }}
              onClose={() => {
                setSelectedProfileId(null);
                setSelectedRecord(null);
              }}
              onSuspend={() =>
                updatePropertyManager(selectedRecord.profileId, "suspend")
              }
              onReactivate={() =>
                updatePropertyManager(selectedRecord.profileId, "reactivate")
              }
            />
          </div>
        ) : (
          <div className="min-w-0">
        <div className="grid gap-3 p-4 md:hidden">
          {isLoading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center text-muted">
              Carico Property Manager...
            </div>
          ) : records.length > 0 ? (
            records.map((record) => {
              const displayName =
                [record.firstName, record.lastName].filter(Boolean).join(" ") ||
                "Senza nome";
              const isBusy = actionProfileId === record.profileId;
              const isSelected = false;
              const isSuspended = isPropertyManagerSuspended(record);

              return (
                <article
                  key={record.profileId}
                  className={`rounded-2xl border p-4 ${
                    isSelected ? "border-green bg-green/5" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{displayName}</p>
                      <p className="mt-1 break-all text-sm text-slate-500">{record.email}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {record.phone ?? "Telefono assente"}
                      </p>
                    </div>
                    <StatusBadge record={record} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <InfoPill label="Citta" value={record.primaryCity} />
                    <InfoPill label="Immobili" value={record.managedPropertiesLabel} />
                    <InfoPill
                      label="Wallet"
                      value={formatCurrencyCents(
                        record.walletBalanceCents,
                        record.walletCurrency,
                      )}
                    />
                    <InfoPill label="Iscritto" value={formatDate(record.createdAt)} />
                  </div>

                  <div className="mt-4 grid gap-2">
                    <button
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
                        isSelected
                          ? "border-green bg-green/10 text-green"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                      type="button"
                      onClick={() => openPropertyManager(record.profileId)}
                    >
                      <Eye size={14} className="inline-block" /> Dettaglio
                    </button>
                    <div className="grid gap-2">
                      <button
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
                          isSuspended
                            ? "border-green/20 bg-green/10 text-green"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          updatePropertyManager(
                            record.profileId,
                            isSuspended ? "reactivate" : "suspend",
                          )
                        }
                      >
                        {isSuspended ? "Riattiva" : "Sospendi"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center text-muted">
              Nessun Property Manager registrato.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
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
                  const isSelected = false;
                  const isSuspended = isPropertyManagerSuspended(record);

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
                            isSuspended
                              ? "bg-red-50 text-red-700"
                              : "bg-green/10 text-green"
                          }`}
                        >
                          {isSuspended ? "Sospeso" : "Attivo"}
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
                            onClick={() => openPropertyManager(record.profileId)}
                          >
                            <Eye size={14} className="inline-block" /> Dettaglio
                          </button>
                          <button
                            className={`rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                              isSuspended
                                ? "border-green/20 bg-green/10 text-green"
                                : "border-red-200 bg-red-50 text-red-700"
                            }`}
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              updatePropertyManager(
                                record.profileId,
                                isSuspended ? "reactivate" : "suspend",
                              )
                            }
                          >
                            {isSuspended ? "Riattiva" : "Sospendi"}
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
        <PaginationControls
          pagination={pagination}
          disabled={isLoading}
          onPageChange={setPage}
        />
          </div>
        )}
      </section>
        </>
      )}
      {bonusTarget ? (
        <WalletBonusModal
          key={bonusTarget.profileId}
          record={bonusTarget}
          isSaving={isBonusSaving}
          onClose={() => setBonusTarget(null)}
          onConfirm={grantWalletBonus}
        />
      ) : null}
    </div>
  );
}

function PropertyManagerDetail({
  record,
  isBusy,
  canGrantBonus,
  onGrantBonus,
  onClose,
  onSuspend,
  onReactivate,
}: {
  record: PropertyManagerRecord;
  isBusy: boolean;
  canGrantBonus: boolean;
  onGrantBonus: () => void;
  onClose: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
}) {
  const displayName =
    [record.firstName, record.lastName].filter(Boolean).join(" ") || "Senza nome";
  const billing = record.billingProfile;
  const isSuspended = isPropertyManagerSuspended(record);

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
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            type="button"
            disabled={isBusy}
            onClick={onClose}
          >
            <X size={16} className="inline-block" /> Chiudi
          </button>
          <button
            className={`rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
              isSuspended
                ? "border-green/20 bg-green/10 text-green"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
            type="button"
            disabled={isBusy}
            onClick={isSuspended ? onReactivate : onSuspend}
          >
            {isSuspended ? "Riattiva" : "Sospendi"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 p-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="grid gap-6">
          <DetailSection icon={UserCheck} title="Dati iscrizione PM">
            <DetailGrid
              items={[
                ["Nome", record.signupData.firstName],
                ["Cognome", record.signupData.lastName],
                ["Email", record.signupData.email],
                ["Telefono", record.signupData.phone],
                ["Gestisci gia immobili?", record.signupData.managedPropertiesLabel],
                ["Citta principale", record.signupData.primaryCity],
                ["Password", record.signupData.passwordStatus],
              ]}
            />
          </DetailSection>

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

            {canGrantBonus ? (
              <button
                type="button"
                disabled={isBusy}
                onClick={onGrantBonus}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-green transition hover:bg-emerald-100 disabled:opacity-50"
              >
                <Gift size={17} /> Regala credito
              </button>
            ) : null}

            <div className="mt-6 border-t border-slate-200 pt-5">
              <div className="mb-3 flex items-center gap-2">
                <ArrowDownToLine size={17} className="text-green" />
                <h4 className="font-semibold text-ink">Ricariche e movimenti wallet</h4>
              </div>
              {record.walletTransactions.length ? (
                <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                  {record.walletTransactions.map((transaction) => (
                    <WalletMovementRow key={transaction.id} transaction={transaction} />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-muted">
                  Nessun movimento wallet registrato.
                </p>
              )}
            </div>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <div className="mb-3 flex items-center gap-2">
                <ShoppingBag size={17} className="text-green" />
                <h4 className="font-semibold text-ink">Acquisti lead</h4>
              </div>
              {record.leadPurchases.length ? (
                <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                  {record.leadPurchases.map((purchase) => (
                    <LeadPurchaseRow key={purchase.id} purchase={purchase} />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-muted">
                  Nessun acquisto lead registrato.
                </p>
              )}
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

function WalletBonusModal({
  record,
  isSaving,
  onClose,
  onConfirm,
}: {
  record: PropertyManagerRecord;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: (input: {
    profileId: string;
    amountCents: number;
    reason: string;
    internalNote: string;
    operationId: string;
  }) => Promise<string | null>;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [formError, setFormError] = useState("");
  const [operationId] = useState(() => crypto.randomUUID());
  const amountCents = parseEuroAmount(amount);
  const isAmountValid = amountCents >= 100 && amountCents <= 100000;
  const resultingBalance = record.walletBalanceCents + (isAmountValid ? amountCents : 0);
  const displayName =
    [record.firstName, record.lastName].filter(Boolean).join(" ") || record.email;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!isAmountValid) {
      setFormError("Inserisci un importo compreso tra 1 € e 1.000 €.");
      return;
    }
    if (reason.trim().length < 3) {
      setFormError("Inserisci una motivazione di almeno 3 caratteri.");
      return;
    }

    const result = await onConfirm({
      profileId: record.profileId,
      amountCents,
      reason: reason.trim(),
      internalNote: internalNote.trim(),
      operationId,
    });
    if (result) setFormError(result);
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-bonus-title"
    >
      <section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="section-kicker">Bonus Wallet</p>
            <h2 id="wallet-bonus-title" className="mt-1 text-xl font-semibold text-ink">
              Regala credito a {displayName}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Chiudi"
            disabled={isSaving}
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>

        <form className="grid gap-5 p-5" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <MetricTile
              label="Saldo attuale"
              value={formatCurrencyCents(record.walletBalanceCents, record.walletCurrency)}
            />
            <MetricTile
              label="Saldo dopo il bonus"
              value={formatCurrencyCents(resultingBalance, record.walletCurrency)}
            />
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-ink">Importo bonus *</span>
            <div className="flex min-h-12 items-center rounded-lg border border-slate-200 bg-white px-3 focus-within:border-green">
              <span className="mr-2 font-semibold text-slate-500">EUR</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                disabled={isSaving}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="20,00"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 font-semibold text-ink outline-none"
              />
            </div>
            <span className="mt-1 block text-xs text-slate-500">Da 1,00 € a 1.000,00 €.</span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-ink">Motivazione *</span>
            <input
              type="text"
              maxLength={160}
              value={reason}
              disabled={isSaving}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ad esempio: Premio cliente fedele"
              className="min-h-12 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-green"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-ink">Nota interna</span>
            <textarea
              maxLength={500}
              rows={3}
              value={internalNote}
              disabled={isSaving}
              onChange={(event) => setInternalNote(event.target.value)}
              placeholder="Informazioni facoltative visibili nell'audit amministrativo"
              className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-green"
            />
          </label>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            Il credito sarà registrato come bonus Wallet. Non sarà conteggiato come
            ricarica, non passerà da Stripe e non genererà fattura.
          </div>

          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {formError}
            </p>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="min-h-12 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isSaving || !isAmountValid || reason.trim().length < 3}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-green px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Gift size={17} /> {isSaving ? "Accredito..." : "Conferma accredito"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function WalletMovementRow({
  transaction,
}: {
  transaction: PropertyManagerRecord["walletTransactions"][number];
}) {
  const stripeReference =
    transaction.stripePaymentId ??
    transaction.stripeCheckoutSessionId ??
    transaction.providerReference;

  return (
    <article className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <p className="font-semibold text-ink">
          {walletTransactionTypeLabel(transaction.type)}
          {transaction.description ? ` · ${transaction.description}` : ""}
        </p>
        <p className="mt-1 text-sm text-muted">
          {formatNullableDate(transaction.completedAt ?? transaction.createdAt)} · {activityStatusLabel(transaction.status)}
        </p>
        {stripeReference ? (
          <p className="mt-2 break-all text-xs text-slate-500">
            Stripe: <span className="font-semibold text-slate-700">{stripeReference}</span>
          </p>
        ) : null}
      </div>
      <p className="font-semibold text-ink">
        {formatCurrencyCents(transaction.amountCents, "eur")}
      </p>
    </article>
  );
}

function LeadPurchaseRow({
  purchase,
}: {
  purchase: PropertyManagerRecord["leadPurchases"][number];
}) {
  return (
    <article className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <p className="font-semibold text-ink">{purchase.leadTitle}</p>
        <p className="mt-1 text-sm text-muted">
          {purchaseModeLabel(purchase.mode)} · {activityStatusLabel(purchase.status)} · {formatNullableDate(purchase.createdAt)}
        </p>
        <p className="mt-2 break-all text-xs text-slate-500">
          ID acquisto: <span className="font-semibold text-slate-700">{purchase.id}</span>
        </p>
      </div>
      <p className="font-semibold text-ink">{formatCurrencyCents(purchase.amountCents, "eur")}</p>
    </article>
  );
}

function walletTransactionTypeLabel(type: PropertyManagerRecord["walletTransactions"][number]["type"]) {
  return {
    top_up: "Ricarica wallet",
    lead_purchase: "Acquisto lead",
    refund: "Riaccredito Wallet",
    adjustment: "Rettifica wallet",
  }[type];
}

function purchaseModeLabel(mode: "shared" | "exclusive") {
  return mode === "exclusive" ? "Acquisto in esclusiva" : "Acquisto condiviso";
}

function activityStatusLabel(status: string) {
  return {
    pending: "In attesa",
    completed: "Completato",
    failed: "Fallito",
    cancelled: "Annullato",
    paid: "Pagato",
    contact_unlocked: "Contatto sbloccato",
    refunded: "Riaccreditato",
  }[status] ?? status;
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
  const isSuspended = isPropertyManagerSuspended(record);
  const className = isSuspended ? "bg-red-50 text-red-700" : "bg-green/10 text-green";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>
      {isSuspended ? "Sospeso" : "Attivo"}
    </span>
  );
}

function parseEuroAmount(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return 0;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function isPropertyManagerSuspended(record: PropertyManagerRecord) {
  return (
    record.profileStatus === "suspended" ||
    record.verificationStatus === "suspended"
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-ink">{value}</p>
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
