"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Crown,
  Eye,
  Filter,
  PauseCircle,
  Search,
  ShieldCheck,
  UserCheck,
  UserRoundCog,
  X,
  XCircle,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import {
  managedPropertiesOptions,
  type ManagedPropertiesRange,
} from "@/lib/domain/pm-onboarding";

type ManagedPropertiesFilter = "" | ManagedPropertiesRange | "not_indicated";

type PrimeStatus = "inactive" | "active" | "past_due" | "suspended" | "cancelled";

type PrimeManager = {
  memberId: string;
  profileId: string;
  name: string;
  email: string;
  roleName: string;
  badgeColor: string;
};

type PrimeEvent = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  created_at: string;
};

type PrimeRow = {
  profile: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    status: "active" | "suspended";
    created_at: string;
  };
  pmProfile: {
    profile_id: string;
    primary_city: string | null;
    managed_properties_range: string | null;
    managed_properties_count: number | null;
  } | null;
  wallet: {
    profile_id: string;
    balance_cents: number;
    currency: string;
  } | null;
  eligibility: {
    is_enabled: boolean;
    enabled_at: string | null;
    disabled_at: string | null;
    notes: string | null;
  } | null;
  account: {
    id: string;
    status: PrimeStatus;
    access_source: "none" | "stripe" | "manual";
    account_manager_member_id: string | null;
    prime_started_at: string | null;
    prime_expires_at: string | null;
    last_activated_at: string | null;
    last_renewed_at: string | null;
    grace_ends_at: string | null;
    payment_status: string;
    admin_override_active: boolean;
    admin_override_reason: string | null;
  } | null;
  accountManager: PrimeManager | null;
  events: PrimeEvent[];
};

type PrimeResponse = {
  access: {
    isSuperAdmin: boolean;
    canWrite: boolean;
    canAssignManager: boolean;
    teamMemberId: string | null;
  };
  stats: {
    total: number;
    eligible: number;
    active: number;
    pastDue: number;
    suspended: number;
  };
  managers: PrimeManager[];
  propertyManagers: PrimeRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  error?: string;
};

type PrimePmDetail = {
  profile: PrimeRow["profile"] & {
    avatar_url: string | null;
    updated_at: string;
  };
  propertyManagerProfile: {
    company_name: string | null;
    vat_number: string | null;
    website: string | null;
    managed_properties_count: number | null;
    managed_properties_range: string | null;
    primary_city: string | null;
    years_experience: number | null;
    business_description: string | null;
    operating_model: string | null;
    verification_status: string;
  } | null;
  wallet: {
    balance_cents: number;
    currency: string;
  } | null;
  billingProfile: {
    subject_type: "individual" | "company";
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
  } | null;
  auth: {
    emailConfirmedAt: string | null;
    lastSignInAt: string | null;
    metadata: Record<string, unknown>;
  };
  internalNotes: string;
  internalNotesUpdatedAt: string | null;
  walletTransactions: Array<{
    id: string;
    type: string;
    status: string;
    amount_cents: number;
    description: string | null;
    provider: string | null;
    provider_reference: string | null;
    created_at: string;
  }>;
  leadPurchases: Array<{
    id: string;
    leadTitle: string;
    mode: string;
    status: string;
    amount_cents: number;
    created_at: string;
  }>;
  reports: Array<{
    id: string;
    subject: string;
    reason: string | null;
    details: string | null;
    status: string;
    created_at: string;
  }>;
  stats: {
    completedPurchases: number;
    totalSpentCents: number;
    topUpsCents: number;
    openReports: number;
  };
};

type AccessAction = "activate" | "suspend" | "deactivate";

const emptyResponse: PrimeResponse = {
  access: { isSuperAdmin: false, canWrite: false, canAssignManager: false, teamMemberId: null },
  stats: { total: 0, eligible: 0, active: 0, pastDue: 0, suspended: 0 },
  managers: [],
  propertyManagers: [],
  pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
};

export function AdminPrimeConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [data, setData] = useState<PrimeResponse>(emptyResponse);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [managedPropertiesFilter, setManagedPropertiesFilter] =
    useState<ManagedPropertiesFilter>("");
  const [scope, setScope] = useState("unassigned");
  const [page, setPage] = useState(1);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<PrimePmDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionDraft, setActionDraft] = useState<{
    row: PrimeRow;
    action: AccessAction;
    reason: string;
    expiresOn: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getToken = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token ?? null;
  }, [supabase]);

  const loadPrime = useCallback(async () => {
    setLoading(true);
    setError("");
    const token = await getToken();
    if (!token) {
      setError("Sessione amministrativa non disponibile.");
      setLoading(false);
      return;
    }

    const query = new URLSearchParams({ page: String(page) });
    if (search) query.set("search", search);
    if (managedPropertiesFilter) query.set("managedProperties", managedPropertiesFilter);
    query.set("scope", scope);
    const response = await fetch(`/api/admin/prime?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as PrimeResponse;
    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare Lead Host PRIME.");
    } else {
      setData(payload);
    }
    setLoading(false);
  }, [getToken, managedPropertiesFilter, page, scope, search]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadPrime(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadPrime]);

  const selectedRow = data.propertyManagers.find(
    (row) => row.profile.id === selectedProfileId,
  );

  async function patch(body: Record<string, unknown>) {
    const token = await getToken();
    if (!token) throw new Error("Sessione amministrativa non disponibile.");
    const response = await fetch("/api/admin/prime", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Operazione PRIME non riuscita.");
  }

  async function claimManager(row: PrimeRow) {
    if (!window.confirm(`Prendere in carico ${displayName(row)}? Da quel momento sarà visibile soltanto nel tuo portafoglio e al Super Admin.`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await patch({ action: "claim_manager", profileId: row.profile.id });
      setSuccess(`${displayName(row)} è stato aggiunto al tuo portafoglio.`);
      await loadPrime();
    } catch (requestError) {
      setError(errorMessage(requestError));
      await loadPrime();
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(row: PrimeRow) {
    setSelectedProfileId(row.profile.id);
    setSelectedDetail(null);
    setDetailLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessione amministrativa non disponibile.");
      const response = await fetch(`/api/admin/prime?profileId=${row.profile.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as { detail?: PrimePmDetail; error?: string };
      if (!response.ok || !payload.detail) {
        throw new Error(payload.error ?? "Dettaglio Property Manager non disponibile.");
      }
      setSelectedDetail(payload.detail);
    } catch (requestError) {
      setSelectedProfileId(null);
      setError(errorMessage(requestError));
    } finally {
      setDetailLoading(false);
    }
  }

  async function toggleEligibility(row: PrimeRow) {
    const enabled = !row.eligibility?.is_enabled;
    if (
      !window.confirm(
        enabled
          ? `Abilitare ${displayName(row)} a visualizzare l'offerta PRIME?`
          : `Disabilitare l'offerta PRIME per ${displayName(row)}? L'accesso PRIME già attivo non verrà rimosso.`,
      )
    ) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await patch({
        action: "set_eligibility",
        profileId: row.profile.id,
        enabled,
        notes: enabled ? "Abilitazione commerciale da console PRIME" : "Offerta PRIME disabilitata da console",
      });
      setSuccess(enabled ? "Offerta PRIME abilitata." : "Offerta PRIME disabilitata.");
      await loadPrime();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function saveInternalNotes(row: PrimeRow, notes: string) {
    try {
      const token = await getToken();
      if (!token) return "Sessione amministrativa non disponibile.";
      const response = await fetch("/api/admin/prime", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update_internal_notes",
          profileId: row.profile.id,
          notes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        internalNotes?: string;
        updatedAt?: string;
      };
      if (!response.ok) return payload.error ?? "Non riesco a salvare le note interne.";
      setSelectedDetail((current) => current ? {
        ...current,
        internalNotes: payload.internalNotes ?? notes.trim(),
        internalNotesUpdatedAt: payload.updatedAt ?? new Date().toISOString(),
      } : current);
      return null;
    } catch {
      return "Connessione non disponibile. Riprova tra poco.";
    }
  }

  async function assignManager(row: PrimeRow, memberId: string) {
    const manager = data.managers.find((item) => item.memberId === memberId);
    const message = manager
      ? `Assegnare ${displayName(row)} a ${manager.name}?`
      : `Rimuovere l'Account Manager assegnato a ${displayName(row)}?`;
    if (!window.confirm(message)) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await patch({
        action: "assign_manager",
        profileId: row.profile.id,
        memberId: memberId || null,
      });
      setSuccess(manager ? "Account Manager assegnato." : "Account Manager rimosso.");
      await loadPrime();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function submitAccessAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionDraft) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await patch({
        action: "manage_access",
        profileId: actionDraft.row.profile.id,
        accessAction: actionDraft.action,
        expiresAt:
          actionDraft.action === "activate" && actionDraft.expiresOn
            ? new Date(`${actionDraft.expiresOn}T23:59:59`).toISOString()
            : null,
        reason: actionDraft.reason,
      });
      setSuccess(accessActionSuccess(actionDraft.action));
      setActionDraft(null);
      await loadPrime();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  return (
    <div className="grid gap-6">
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Stat label="PM visibili" value={data.stats.total} icon={Eye} tone="slate" />
        <Stat label="Offerta abilitata" value={data.stats.eligible} icon={UserCheck} tone="blue" />
        <Stat label="PRIME attivi" value={data.stats.active} icon={Crown} tone="green" />
        <Stat label="Pagamenti critici" value={data.stats.pastDue} icon={CalendarClock} tone="amber" />
        <Stat label="Sospesi" value={data.stats.suspended} icon={PauseCircle} tone="red" />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <div>
            <p className="section-kicker">Portafoglio PRIME</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Property Manager</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Consulta i PM disponibili e prendi in carico quelli che seguirai per Lead Host PRIME.
            </p>
          </div>
        </div>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {(data.access.isSuperAdmin
            ? [
                ["all", "Tutti"],
                ["unassigned", "Non assegnati"],
                ["assigned", "Assegnati"],
              ]
            : [
                ["unassigned", "PM da contattare"],
                ["mine", "Il mio portafoglio"],
              ]
          ).map(([value, label]) => (
            <button
              key={value}
              className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-semibold transition ${scope === value ? "bg-green text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              type="button"
              onClick={() => {
                setPage(1);
                setScope(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <form className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)_auto_auto] lg:items-end" onSubmit={submitSearch}>
          <label className="block min-w-0">
            <span className="mb-2 block text-sm font-semibold text-ink">Cerca Property Manager</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
              <input
                className="min-h-12 w-full rounded-lg border border-slate-200 bg-white py-3 pl-12 pr-3 text-sm outline-none focus:border-green focus:ring-2 focus:ring-green/10"
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Nome, email, telefono o città principale"
              />
            </span>
          </label>
          <label className="block min-w-0">
            <span className="mb-2 block text-sm font-semibold text-ink">Immobili gestiti</span>
            <span className="relative block">
              <Filter className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
              <select
                className="min-h-12 w-full appearance-none rounded-lg border border-slate-200 bg-white py-3 pl-12 pr-10 text-sm font-semibold text-ink outline-none focus:border-green focus:ring-2 focus:ring-green/10"
                value={managedPropertiesFilter}
                onChange={(event) => {
                  setPage(1);
                  setManagedPropertiesFilter(event.target.value as ManagedPropertiesFilter);
                }}
              >
                <option value="">Tutti</option>
                {managedPropertiesOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
                <option value="not_indicated">Non indicato</option>
              </select>
            </span>
          </label>
          <button className="min-h-12 rounded-lg bg-ink px-5 text-sm font-semibold text-white" type="submit">Cerca</button>
          <button
            className="min-h-12 rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            type="button"
            disabled={!searchDraft && !search && !managedPropertiesFilter}
            onClick={() => {
              setSearchDraft("");
              setSearch("");
              setManagedPropertiesFilter("");
              setPage(1);
            }}
          >
            Reset
          </button>
        </form>
      </section>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      {loading ? (
        <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
          Carico il portafoglio PRIME...
        </section>
      ) : data.propertyManagers.length ? (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-3 p-4 md:hidden">
            {data.propertyManagers.map((row) => (
              <article key={row.profile.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{displayName(row)}</p>
                    <p className="mt-1 break-all text-sm text-slate-500">{row.profile.email}</p>
                    <p className="mt-1 text-sm text-slate-500">{row.profile.phone ?? "Telefono assente"}</p>
                  </div>
                  <StatusBadge status={row.account?.status ?? "inactive"} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <InfoPill label="Città" value={row.pmProfile?.primary_city ?? "Non indicata"} />
                  <InfoPill label="Immobili" value={managedPropertiesLabel(row.pmProfile?.managed_properties_range, row.pmProfile?.managed_properties_count)} />
                  <InfoPill label="Wallet" value={formatMoney(row.wallet?.balance_cents ?? 0)} />
                  <InfoPill label="Account Manager" value={row.accountManager?.name ?? "Non assegnato"} />
                </div>
                {data.access.canAssignManager ? (
                  <ManagerSelect row={row} managers={data.managers} saving={saving} onChange={assignManager} />
                ) : null}
                <div className="mt-4">
                  <PrimeRowActions
                    row={row}
                    access={data.access}
                    saving={saving}
                    onDetail={openDetail}
                    onClaim={claimManager}
                    onToggleEligibility={toggleEligibility}
                  />
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Property Manager</th>
                  <th className="px-5 py-4 font-semibold">Città principale</th>
                  <th className="px-5 py-4 font-semibold">Immobili</th>
                  <th className="px-5 py-4 font-semibold">Wallet</th>
                  <th className="px-5 py-4 font-semibold">Stato PRIME</th>
                  <th className="px-5 py-4 font-semibold">Account Manager</th>
                  <th className="px-5 py-4 font-semibold">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.propertyManagers.map((row) => (
                  <tr key={row.profile.id} className="align-top transition hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-ink">{displayName(row)}</p>
                      <p className="mt-1 text-slate-500">{row.profile.email}</p>
                      <p className="mt-1 text-slate-500">{row.profile.phone ?? "Telefono assente"}</p>
                    </td>
                    <td className="px-5 py-4 font-medium text-ink">{row.pmProfile?.primary_city ?? "Non indicata"}</td>
                    <td className="px-5 py-4 text-slate-600">{managedPropertiesLabel(row.pmProfile?.managed_properties_range, row.pmProfile?.managed_properties_count)}</td>
                    <td className="px-5 py-4 font-semibold text-ink">{formatMoney(row.wallet?.balance_cents ?? 0)}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={row.account?.status ?? "inactive"} />
                      {row.eligibility?.is_enabled ? <p className="mt-2 text-xs font-semibold text-blue-700">Offerta abilitata</p> : null}
                    </td>
                    <td className="min-w-48 px-5 py-4">
                      {data.access.canAssignManager ? (
                        <ManagerSelect row={row} managers={data.managers} saving={saving} onChange={assignManager} compact />
                      ) : (
                        <span className="font-semibold text-slate-700">{row.accountManager?.name ?? "Non assegnato"}</span>
                      )}
                    </td>
                    <td className="min-w-52 px-5 py-4">
                      <PrimeRowActions
                        row={row}
                        access={data.access}
                        saving={saving}
                        onDetail={openDetail}
                        onClaim={claimManager}
                        onToggleEligibility={toggleEligibility}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white p-10 text-center">
          <Crown className="mx-auto size-8 text-slate-300" />
          <h3 className="mt-4 text-lg font-semibold text-ink">Nessun Property Manager trovato</h3>
          <p className="mt-2 text-sm text-slate-500">Modifica la ricerca oppure assegna un portafoglio PRIME al ruolo.</p>
        </section>
      )}

      {data.pagination.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>Precedente</button>
          <span className="text-sm font-semibold text-slate-500">Pagina {data.pagination.page} di {data.pagination.totalPages}</span>
          <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40" onClick={() => setPage((value) => Math.min(data.pagination.totalPages, value + 1))} disabled={page >= data.pagination.totalPages}>Successiva</button>
        </div>
      ) : null}

      {selectedRow ? (
        <PrimeDetailModal
          row={selectedRow}
          detail={selectedDetail}
          loading={detailLoading}
          canWrite={Boolean(
            data.access.canWrite &&
            (data.access.isSuperAdmin ||
              selectedRow.account?.account_manager_member_id === data.access.teamMemberId),
          )}
          onSaveNotes={(notes) => saveInternalNotes(selectedRow, notes)}
          onClose={() => {
            setSelectedProfileId(null);
            setSelectedDetail(null);
          }}
          onAction={(action) => setActionDraft({ row: selectedRow, action, reason: "", expiresOn: "" })}
        />
      ) : null}

      {actionDraft ? (
        <AccessActionModal
          draft={actionDraft}
          saving={saving}
          onChange={setActionDraft}
          onClose={() => setActionDraft(null)}
          onSubmit={submitAccessAction}
        />
      ) : null}
    </div>
  );
}

function ManagerSelect({
  row,
  managers,
  saving,
  onChange,
  compact = false,
}: {
  row: PrimeRow;
  managers: PrimeManager[];
  saving: boolean;
  onChange: (row: PrimeRow, memberId: string) => Promise<void>;
  compact?: boolean;
}) {
  return (
    <label className={compact ? "block" : "mt-4 block"}>
      {!compact ? <span className="text-xs font-bold uppercase text-slate-400">Account Manager</span> : null}
      <select
        className={`${compact ? "" : "mt-2"} min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700`}
        value={row.account?.account_manager_member_id ?? ""}
        onChange={(event) => void onChange(row, event.target.value)}
        disabled={saving}
        aria-label={`Account Manager di ${displayName(row)}`}
      >
        <option value="">Non assegnato</option>
        {managers.map((manager) => (
          <option key={manager.memberId} value={manager.memberId}>{manager.name}</option>
        ))}
      </select>
    </label>
  );
}

function PrimeRowActions({
  row,
  access,
  saving,
  onDetail,
  onClaim,
  onToggleEligibility,
}: {
  row: PrimeRow;
  access: PrimeResponse["access"];
  saving: boolean;
  onDetail: (row: PrimeRow) => Promise<void>;
  onClaim: (row: PrimeRow) => Promise<void>;
  onToggleEligibility: (row: PrimeRow) => Promise<void>;
}) {
  const isAssignedToCurrentManager =
    Boolean(access.teamMemberId) &&
    row.account?.account_manager_member_id === access.teamMemberId;
  const canManagePrime = access.canWrite && (access.isSuperAdmin || isAssignedToCurrentManager);
  const canClaim =
    !access.isSuperAdmin &&
    access.canWrite &&
    !row.account?.account_manager_member_id;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-green/40 hover:text-green"
        type="button"
        onClick={() => void onDetail(row)}
      >
        <Eye size={14} className="mr-1 inline-block" /> Dettaglio
      </button>
      {canClaim ? (
        <button
          className="min-h-10 rounded-lg bg-green px-3 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
          type="button"
          onClick={() => void onClaim(row)}
          disabled={saving}
        >
          Prendi in carico
        </button>
      ) : null}
      {canManagePrime ? (
        <button
          className={`min-h-10 rounded-lg px-3 text-xs font-semibold disabled:opacity-50 ${row.eligibility?.is_enabled ? "border border-red-200 bg-red-50 text-red-700" : "bg-blue-600 text-white"}`}
          type="button"
          onClick={() => void onToggleEligibility(row)}
          disabled={saving}
        >
          {row.eligibility?.is_enabled ? "Disabilita offerta" : "Abilita offerta"}
        </button>
      ) : null}
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Eye; tone: "slate" | "blue" | "green" | "amber" | "red" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <span className={`flex size-9 items-center justify-center rounded-lg ${tones[tone]}`}><Icon size={18} /></span>
      </div>
      <p className="mt-4 text-3xl font-semibold text-ink">{value}</p>
    </article>
  );
}

function PrimeDetailModal({ row, detail, loading, canWrite, onClose, onAction, onSaveNotes }: { row: PrimeRow; detail: PrimePmDetail | null; loading: boolean; canWrite: boolean; onClose: () => void; onAction: (action: AccessAction) => void; onSaveNotes: (notes: string) => Promise<string | null> }) {
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={`Dettaglio PRIME di ${displayName(row)}`}>
      <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="section-kicker">Dettaglio PRIME</p>
            <h2 className="mt-1 truncate text-xl font-semibold text-ink">{displayName(row)}</h2>
          </div>
          <button className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600" onClick={onClose} aria-label="Chiudi dettaglio" type="button"><X size={19} /></button>
        </div>
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 p-5">
            <h3 className="flex items-center gap-2 font-semibold text-ink"><ShieldCheck className="size-5 text-green" /> Accesso e stato</h3>
            <dl className="mt-5 grid gap-4 text-sm">
              <Detail label="Stato"><StatusBadge status={row.account?.status ?? "inactive"} /></Detail>
              <Detail label="Offerta commerciale">{row.eligibility?.is_enabled ? "Abilitata" : "Non abilitata"}</Detail>
              <Detail label="Origine accesso">{row.account?.access_source === "manual" ? "Override amministrativo" : row.account?.access_source === "stripe" ? "Stripe" : "Nessuna"}</Detail>
              <Detail label="Account Manager">{row.accountManager?.name ?? "Non assegnato"}</Detail>
              <Detail label="Inizio PRIME">{formatDate(row.account?.prime_started_at)}</Detail>
              <Detail label="Scadenza PRIME">{formatDate(row.account?.prime_expires_at)}</Detail>
              <Detail label="Ultimo rinnovo">{formatDate(row.account?.last_renewed_at)}</Detail>
              <Detail label="Stato pagamento">{row.account?.payment_status ?? "Non applicabile"}</Detail>
            </dl>
            {canWrite ? (
              <div className="mt-6 grid gap-2 sm:grid-cols-3">
                <button className="min-h-10 rounded-lg bg-green px-3 text-sm font-semibold text-white" onClick={() => onAction("activate")} type="button">Attiva</button>
                <button className="min-h-10 rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-800" onClick={() => onAction("suspend")} type="button">Sospendi</button>
                <button className="min-h-10 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700" onClick={() => onAction("deactivate")} type="button">Disattiva</button>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-slate-200 p-5">
            <h3 className="flex items-center gap-2 font-semibold text-ink"><UserRoundCog className="size-5 text-green" /> Storico PRIME</h3>
            <div className="mt-5 grid gap-3">
              {row.events.length ? row.events.map((event) => (
                <article key={event.id} className="rounded-lg bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{eventLabel(event.event_type)}</p>
                    <time className="text-xs text-slate-500">{formatDateTime(event.created_at)}</time>
                  </div>
                  {event.reason ? <p className="mt-2 text-sm leading-5 text-slate-600">{event.reason}</p> : null}
                </article>
              )) : <p className="text-sm text-slate-500">Nessuna operazione PRIME registrata.</p>}
            </div>
          </section>

          {loading ? (
            <section className="rounded-lg border border-slate-200 p-8 text-center text-sm font-semibold text-slate-500 lg:col-span-2">
              Carico tutti i dati del Property Manager...
            </section>
          ) : detail ? (
            <>
              {canWrite && row.account ? (
                <PrimeNotesSection
                  key={`${row.profile.id}-${detail.internalNotesUpdatedAt ?? "new"}`}
                  initialNotes={detail.internalNotes}
                  updatedAt={detail.internalNotesUpdatedAt}
                  onSave={onSaveNotes}
                />
              ) : null}
              <section className="rounded-lg border border-slate-200 p-5">
                <h3 className="font-semibold text-ink">Dati Property Manager</h3>
                <dl className="mt-5 grid gap-4 text-sm">
                  <Detail label="Email">{detail.profile.email}</Detail>
                  <Detail label="Telefono">{detail.profile.phone ?? "Non indicato"}</Detail>
                  <Detail label="Città principale">{detail.propertyManagerProfile?.primary_city ?? "Non indicata"}</Detail>
                  <Detail label="Immobili gestiti">{managedPropertiesLabel(detail.propertyManagerProfile?.managed_properties_range, detail.propertyManagerProfile?.managed_properties_count)}</Detail>
                  <Detail label="Azienda">{detail.propertyManagerProfile?.company_name ?? "Non indicata"}</Detail>
                  <Detail label="Partita IVA">{detail.propertyManagerProfile?.vat_number ?? "Non indicata"}</Detail>
                  <Detail label="Sito web">{detail.propertyManagerProfile?.website ?? "Non indicato"}</Detail>
                  <Detail label="Anni di esperienza">{detail.propertyManagerProfile?.years_experience?.toString() ?? "Non indicati"}</Detail>
                  <Detail label="Modello operativo">{detail.propertyManagerProfile?.operating_model ?? "Non indicato"}</Detail>
                  <Detail label="Stato account">{detail.profile.status === "active" ? "Attivo" : "Sospeso"}</Detail>
                  <Detail label="Data iscrizione">{formatDate(detail.profile.created_at)}</Detail>
                  <Detail label="Email confermata">{formatDate(detail.auth.emailConfirmedAt)}</Detail>
                  <Detail label="Ultimo accesso">{formatDateTimeOptional(detail.auth.lastSignInAt)}</Detail>
                </dl>
                {detail.propertyManagerProfile?.business_description ? (
                  <div className="mt-5 rounded-lg bg-slate-50 p-4">
                    <p className="text-[11px] font-bold uppercase text-slate-400">Descrizione attività</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{detail.propertyManagerProfile.business_description}</p>
                  </div>
                ) : null}
              </section>

              <section className="rounded-lg border border-slate-200 p-5">
                <h3 className="font-semibold text-ink">Wallet e attività</h3>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Metric label="Saldo Wallet" value={formatMoney(detail.wallet?.balance_cents ?? 0)} />
                  <Metric label="Ricariche" value={formatMoney(detail.stats.topUpsCents)} />
                  <Metric label="Lead acquistati" value={String(detail.stats.completedPurchases)} />
                  <Metric label="Spesa Lead" value={formatMoney(detail.stats.totalSpentCents)} />
                  <Metric label="Assistenze aperte" value={String(detail.stats.openReports)} />
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-5 lg:col-span-2">
                <h3 className="font-semibold text-ink">Dati di fatturazione</h3>
                {detail.billingProfile ? (
                  <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                    <Detail label="Tipologia">{detail.billingProfile.subject_type === "company" ? "Società" : "Persona fisica"}</Detail>
                    <Detail label="Intestatario">{billingName(detail.billingProfile)}</Detail>
                    <Detail label="Codice fiscale">{detail.billingProfile.fiscal_code ?? detail.billingProfile.company_fiscal_code ?? "Non indicato"}</Detail>
                    <Detail label="Partita IVA">{detail.billingProfile.vat_number ?? "Non indicata"}</Detail>
                    <Detail label="Indirizzo">{billingAddress(detail.billingProfile)}</Detail>
                    <Detail label="Email fatture">{detail.billingProfile.invoice_email ?? "Non indicata"}</Detail>
                    {detail.billingProfile.subject_type === "company" ? (
                      <>
                        <Detail label="Codice SDI">{detail.billingProfile.sdi_code ?? "Non indicato"}</Detail>
                        <Detail label="PEC">{detail.billingProfile.pec ?? "Non indicata"}</Detail>
                      </>
                    ) : null}
                  </dl>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">Dati di fatturazione non ancora inseriti.</p>
                )}
              </section>

              <ActivitySection
                title="Movimenti Wallet"
                empty="Nessun movimento Wallet."
                items={detail.walletTransactions.map((transaction) => ({
                  id: transaction.id,
                  title: transaction.description ?? transactionLabel(transaction.type),
                  meta: `${formatDateTime(transaction.created_at)} · ${transaction.status}`,
                  value: formatSignedMoney(transaction.amount_cents),
                }))}
              />
              <ActivitySection
                title="Lead acquistati"
                empty="Nessun Lead acquistato."
                items={detail.leadPurchases.map((purchase) => ({
                  id: purchase.id,
                  title: purchase.leadTitle,
                  meta: `${formatDateTime(purchase.created_at)} · ${purchase.mode} · ${purchase.status}`,
                  value: formatMoney(purchase.amount_cents),
                }))}
              />
              <ActivitySection
                title="Assistenza"
                empty="Nessuna richiesta di assistenza."
                items={detail.reports.map((report) => ({
                  id: report.id,
                  title: report.subject,
                  meta: `${formatDateTime(report.created_at)} · ${report.status}`,
                  value: report.reason ?? "",
                }))}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PrimeNotesSection({
  initialNotes,
  updatedAt,
  onSave,
}: {
  initialNotes: string;
  updatedAt: string | null;
  onSave: (notes: string) => Promise<string | null>;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const hasChanges = notes.trim() !== initialNotes.trim();

  async function submitNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingNotes(true);
    setNotesError("");
    setNotesSaved(false);
    const error = await onSave(notes);
    if (error) setNotesError(error);
    else setNotesSaved(true);
    setSavingNotes(false);
  }

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/50 p-5 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">Note interne PRIME</h3>
          <p className="mt-1 text-sm text-slate-600">
            Visibili soltanto al Super Admin e all&apos;Account Manager assegnato.
          </p>
        </div>
        {updatedAt ? (
          <p className="text-xs font-semibold text-slate-500">
            Aggiornate {formatDateTime(updatedAt)}
          </p>
        ) : null}
      </div>
      <form className="mt-4" onSubmit={submitNotes}>
        <textarea
          className="min-h-36 w-full resize-y rounded-lg border border-amber-200 bg-white p-3 text-sm leading-6 text-ink outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          value={notes}
          maxLength={5000}
          onChange={(event) => {
            setNotes(event.target.value);
            setNotesSaved(false);
          }}
          placeholder="Aggiungi informazioni utili sulle conversazioni, esigenze del PM e prossime attività..."
        />
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-slate-500">{notes.length}/5000 caratteri</p>
            {notesError ? <p className="mt-1 text-sm font-semibold text-red-700">{notesError}</p> : null}
            {notesSaved ? <p className="mt-1 text-sm font-semibold text-emerald-700">Note interne salvate.</p> : null}
          </div>
          <button
            className="min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-white disabled:opacity-40"
            type="submit"
            disabled={savingNotes || !hasChanges}
          >
            {savingNotes ? "Salvataggio..." : "Salva note"}
          </button>
        </div>
      </form>
    </section>
  );
}

function AccessActionModal({ draft, saving, onChange, onClose, onSubmit }: { draft: { row: PrimeRow; action: AccessAction; reason: string; expiresOn: string }; saving: boolean; onChange: (value: typeof draft) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true">
      <form className="w-full max-w-lg rounded-lg bg-white p-5 shadow-2xl sm:p-6" onSubmit={onSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div><p className="section-kicker">Override amministrativo</p><h2 className="mt-2 text-xl font-semibold text-ink">{accessActionTitle(draft.action)}</h2><p className="mt-1 text-sm text-slate-500">{displayName(draft.row)}</p></div>
          <button className="flex size-9 items-center justify-center rounded-lg border border-slate-200" type="button" onClick={onClose} aria-label="Chiudi"><X size={18} /></button>
        </div>
        {draft.action === "activate" ? (
          <label className="mt-5 block text-sm font-semibold text-slate-700">Scadenza accesso opzionale<input className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal" type="date" value={draft.expiresOn} onChange={(event) => onChange({ ...draft, expiresOn: event.target.value })} /></label>
        ) : null}
        <label className="mt-5 block text-sm font-semibold text-slate-700">Motivazione<textarea className="mt-2 min-h-28 w-full resize-y rounded-lg border border-slate-200 p-3 font-normal" required minLength={3} maxLength={1000} value={draft.reason} onChange={(event) => onChange({ ...draft, reason: event.target.value })} placeholder="Inserisci una nota utile per lo storico amministrativo" /></label>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="min-h-11 rounded-lg border border-slate-200 px-5 text-sm font-semibold" type="button" onClick={onClose}>Annulla</button>
          <button className="min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={saving} type="submit">{saving ? "Salvataggio..." : "Conferma operazione"}</button>
        </div>
      </form>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold text-slate-800">{children}</dd></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

function ActivitySection({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; title: string; meta: string; value: string }>;
}) {
  return (
    <section className="rounded-lg border border-slate-200 p-5 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-ink">{title}</h3>
        {items.length ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {items.length}
          </span>
        ) : null}
      </div>
      {items.length ? (
        <div className="mt-4 grid gap-2">
          {items.map((item) => (
            <article
              key={item.id}
              className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-slate-800">{item.title}</p>
                <p className="mt-1 break-words text-xs text-slate-500">{item.meta}</p>
              </div>
              {item.value ? (
                <p className="break-words text-sm font-semibold text-slate-700 sm:max-w-56 sm:text-right">
                  {item.value}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">{empty}</p>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: PrimeStatus }) {
  const styles: Record<PrimeStatus, string> = {
    active: "bg-emerald-100 text-emerald-800",
    past_due: "bg-amber-100 text-amber-800",
    suspended: "bg-red-100 text-red-700",
    cancelled: "bg-slate-200 text-slate-700",
    inactive: "bg-slate-100 text-slate-600",
  };
  const labels: Record<PrimeStatus, string> = { active: "PRIME attivo", past_due: "Pagamento scaduto", suspended: "Sospeso", cancelled: "Cancellato", inactive: "Non attivo" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${styles[status]}`}>{labels[status]}</span>;
}

function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : XCircle;
  return <div className={`flex items-center gap-2 rounded-lg border p-4 text-sm font-semibold ${tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}><Icon size={18} />{children}</div>;
}

function displayName(row: PrimeRow) {
  return [row.profile.first_name, row.profile.last_name].filter(Boolean).join(" ") || row.profile.email;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function formatDate(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(value)) : "Non impostata";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDateTimeOptional(value: string | null | undefined) {
  return value ? formatDateTime(value) : "Non disponibile";
}

function formatSignedMoney(cents: number) {
  const value = formatMoney(Math.abs(cents));
  if (cents > 0) return `+ ${value}`;
  if (cents < 0) return `- ${value}`;
  return value;
}

function managedPropertiesLabel(value: string | null | undefined, count?: number | null) {
  const labels: Record<string, string> = {
    starting_now: "Sto iniziando ora",
    one_to_three: "Gestisco da 1 a 3 immobili",
    four_to_ten: "Gestisco da 4 a 10 immobili",
    more_than_ten: "Gestisco più di 10 immobili",
  };
  if (value) return labels[value] ?? value;
  if (count === 0) return labels.starting_now;
  if (count && count <= 3) return labels.one_to_three;
  if (count && count <= 10) return labels.four_to_ten;
  if (count && count > 10) return labels.more_than_ten;
  return "Non indicato";
}

function billingName(billing: NonNullable<PrimePmDetail["billingProfile"]>) {
  if (billing.subject_type === "company") {
    return billing.company_name ?? "Non indicato";
  }
  return [billing.first_name, billing.last_name].filter(Boolean).join(" ") || "Non indicato";
}

function billingAddress(billing: NonNullable<PrimePmDetail["billingProfile"]>) {
  return [
    billing.address_line,
    [billing.postal_code, billing.city].filter(Boolean).join(" "),
    billing.province,
    billing.country,
  ].filter(Boolean).join(", ") || "Non indicato";
}

function transactionLabel(type: string) {
  const labels: Record<string, string> = {
    top_up: "Ricarica Wallet",
    lead_purchase: "Acquisto Lead",
    refund: "Riaccredito",
    bonus: "Credito bonus",
    adjustment: "Rettifica Wallet",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

function eventLabel(value: string) {
  return ({ eligibility_enabled: "Offerta abilitata", eligibility_disabled: "Offerta disabilitata", manual_activate: "Accesso attivato manualmente", manual_suspend: "Accesso sospeso", manual_deactivate: "Accesso disattivato", account_manager_assigned: "Account Manager assegnato", account_manager_unassigned: "Account Manager rimosso", account_manager_claimed: "Property Manager preso in carico" } as Record<string, string>)[value] ?? value.replaceAll("_", " ");
}

function accessActionTitle(action: AccessAction) {
  return action === "activate" ? "Attiva accesso PRIME" : action === "suspend" ? "Sospendi accesso PRIME" : "Disattiva accesso PRIME";
}

function accessActionSuccess(action: AccessAction) {
  return action === "activate" ? "Accesso PRIME attivato." : action === "suspend" ? "Accesso PRIME sospeso." : "Accesso PRIME disattivato.";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operazione PRIME non riuscita.";
}
