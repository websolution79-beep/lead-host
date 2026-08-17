"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeEuro,
  CircleAlert,
  RefreshCw,
  RotateCcw,
  Search,
  UserRoundCheck,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";

type EventStatus = "accrued" | "pending_attribution" | "voided";
type EventType =
  | "lead_verification"
  | "prime_first_activation"
  | "prime_renewal"
  | "prime_lead_purchase"
  | "refund_adjustment"
  | "manual_adjustment";

type ActiveMember = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  roleName: string;
};

type CompensationEvent = {
  id: string;
  memberId: string | null;
  eventType: EventType;
  status: EventStatus;
  amountCents: number;
  description: string;
  occurredAt: string;
  memberFirstName: string | null;
  memberLastName: string | null;
  memberEmail: string | null;
  memberRoleName: string | null;
  propertyManagerFirstName: string | null;
  propertyManagerLastName: string | null;
  propertyManagerEmail: string | null;
  leadTitle: string | null;
};

type DashboardPayload = {
  featureEnabled: boolean;
  stats: {
    eventCount: number;
    grossAccruedCents: number;
    adjustmentsCents: number;
    netAccruedCents: number;
    pendingAttributionCents: number;
    pendingAttributionCount: number;
  };
  memberSummaries: Array<{
    memberId: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    roleName: string;
    eventCount: number;
    grossCents: number;
    adjustmentsCents: number;
    netCents: number;
  }>;
  events: CompensationEvent[];
  activeMembers: ActiveMember[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  error?: string;
};

const emptyPayload: DashboardPayload = {
  featureEnabled: false,
  stats: {
    eventCount: 0,
    grossAccruedCents: 0,
    adjustmentsCents: 0,
    netAccruedCents: 0,
    pendingAttributionCents: 0,
    pendingAttributionCount: 0,
  },
  memberSummaries: [],
  events: [],
  activeMembers: [],
  pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 1 },
};

export function AdminTeamCompensations() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [payload, setPayload] = useState(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [eventType, setEventType] = useState("");
  const [memberId, setMemberId] = useState("");
  const [page, setPage] = useState(1);
  const [assignmentByEvent, setAssignmentByEvent] = useState<Record<string, string>>({});

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const token = await getToken();
    if (!token) {
      setError("Sessione Super Admin non disponibile.");
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    if (eventType) params.set("eventType", eventType);
    if (memberId) params.set("memberId", memberId);
    const response = await fetch(`/api/admin/team/compensations?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = (await response.json()) as DashboardPayload;
    if (!response.ok) setError(result.error ?? "Non riesco a caricare i compensi.");
    else setPayload(result);
    setLoading(false);
  }, [eventType, getToken, memberId, page, search, status]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  async function assignEvent(eventId: string) {
    const selectedMemberId = assignmentByEvent[eventId];
    if (!selectedMemberId) return;
    setAssigning(eventId);
    setError("");
    const token = await getToken();
    const response = await fetch("/api/admin/team/compensations", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ eventId, memberId: selectedMemberId }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error ?? "Compenso non attribuito.");
    else await load();
    setAssigning("");
  }

  function resetFilters() {
    setSearch("");
    setStatus("");
    setEventType("");
    setMemberId("");
    setPage(1);
  }

  return (
    <div className="grid gap-6 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-green/10 text-green">
            <BadgeEuro size={21} />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-ink">Compensi maturati</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              Controlla attività, rettifiche e attribuzioni del Team. Le liquidazioni saranno gestite separatamente.
            </p>
          </div>
        </div>
        <button className="btn w-full sm:w-auto" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={17} className={loading ? "animate-spin" : ""} /> Aggiorna
        </button>
      </div>

      {!payload.featureEnabled ? (
        <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          <CircleAlert className="mt-0.5 shrink-0" size={19} />
          <p>Il motore compensi è ancora disattivato. Questa schermata è pronta, ma non vengono ancora maturati nuovi importi.</p>
        </div>
      ) : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Lordo maturato" value={formatCurrencyCents(payload.stats.grossAccruedCents)} />
        <Metric label="Rettifiche" value={`- ${formatCurrencyCents(payload.stats.adjustmentsCents)}`} tone="amber" />
        <Metric label="Netto maturato" value={formatCurrencyCents(payload.stats.netAccruedCents)} tone="green" />
        <Metric label="Da attribuire" value={formatCurrencyCents(payload.stats.pendingAttributionCents)} tone="blue" />
        <Metric label="Attività" value={String(payload.stats.eventCount)} detail={`${payload.stats.pendingAttributionCount} senza assegnatario`} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="section-kicker">Riepilogo collaboratori</p>
        {payload.memberSummaries.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {payload.memberSummaries.map((member) => (
              <div key={member.memberId} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{displayName(member)}</p>
                    <p className="mt-1 truncate text-xs text-muted">{member.roleName} · {member.eventCount} attività</p>
                  </div>
                  <strong className="shrink-0 text-green">{formatCurrencyCents(member.netCents)}</strong>
                </div>
                {member.adjustmentsCents > 0 ? <p className="mt-3 text-xs font-semibold text-amber-700">Rettifiche: - {formatCurrencyCents(member.adjustmentsCents)}</p> : null}
              </div>
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-muted">Nessun compenso attribuito.</p>}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 xl:flex-row">
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3">
            <Search size={17} className="text-muted" />
            <input className="min-w-0 flex-1 outline-none" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Collaboratore, PM, Lead o attività" />
          </label>
          <FilterSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} label="Tutti gli stati" options={statusOptions} />
          <FilterSelect value={eventType} onChange={(value) => { setEventType(value); setPage(1); }} label="Tutte le attività" options={eventTypeOptions} />
          <select className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 font-semibold" value={memberId} onChange={(event) => { setMemberId(event.target.value); setPage(1); }}>
            <option value="">Tutti i membri</option>
            {payload.activeMembers.map((member) => <option key={member.id} value={member.id}>{displayName(member)}</option>)}
          </select>
          <button className="btn" type="button" onClick={resetFilters}><RotateCcw size={16} /> Reset</button>
        </div>

        {loading ? <p className="py-10 text-center text-sm font-semibold text-muted">Carico compensi...</p> : payload.events.length ? (
          <div className="mt-5 grid gap-3">
            {payload.events.map((event) => (
              <article key={event.id} className="grid gap-4 rounded-lg border border-slate-200 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={statusClass(event.status)}>{statusLabel(event.status)}</span>
                    <span className="text-xs font-semibold text-muted">{formatDateTime(event.occurredAt)}</span>
                  </div>
                  <h4 className="mt-2 font-semibold text-ink">{eventTypeLabel(event.eventType)}</h4>
                  <p className="mt-1 text-sm text-muted">{event.description}</p>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    {event.memberId ? `Collaboratore: ${displayName({ firstName: event.memberFirstName, lastName: event.memberLastName, email: event.memberEmail ?? "" })}` : "Collaboratore non ancora attribuito"}
                    {event.propertyManagerEmail ? ` · PM: ${displayName({ firstName: event.propertyManagerFirstName, lastName: event.propertyManagerLastName, email: event.propertyManagerEmail })}` : ""}
                    {event.leadTitle ? ` · Lead: ${event.leadTitle}` : ""}
                  </p>
                </div>
                <div className="flex flex-col gap-2 lg:min-w-56 lg:items-end">
                  <strong className={event.amountCents < 0 ? "text-lg text-red-600" : "text-lg text-green"}>{formatCurrencyCents(event.amountCents)}</strong>
                  {event.status === "pending_attribution" ? (
                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                      <select className="min-h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold" value={assignmentByEvent[event.id] ?? ""} onChange={(change) => setAssignmentByEvent((current) => ({ ...current, [event.id]: change.target.value }))}>
                        <option value="">Seleziona membro</option>
                        {payload.activeMembers.map((member) => <option key={member.id} value={member.id}>{displayName(member)}</option>)}
                      </select>
                      <button className="btn btn-primary" type="button" disabled={!assignmentByEvent[event.id] || assigning === event.id} onClick={() => void assignEvent(event.id)}>
                        <UserRoundCheck size={16} /> {assigning === event.id ? "Assegno..." : "Assegna"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : <p className="py-10 text-center text-sm text-muted">Nessun compenso trovato.</p>}

        {payload.pagination.totalPages > 1 ? (
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <button className="btn" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Precedente</button>
            <span className="text-sm font-semibold text-muted">Pagina {payload.pagination.page} di {payload.pagination.totalPages}</span>
            <button className="btn" type="button" disabled={page >= payload.pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Successiva</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Metric({ label, value, detail, tone = "slate" }: { label: string; value: string; detail?: string; tone?: "slate" | "green" | "amber" | "blue" }) {
  const tones = { slate: "text-ink", green: "text-green", amber: "text-amber-700", blue: "text-blue-700" };
  return <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase text-muted">{label}</p><p className={`mt-3 text-2xl font-semibold ${tones[tone]}`}>{value}</p>{detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}</div>;
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: Array<{ value: string; label: string }> }) {
  return <select className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 font-semibold" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
}

const statusOptions = [
  { value: "accrued", label: "Maturati" },
  { value: "pending_attribution", label: "Da attribuire" },
  { value: "voided", label: "Annullati" },
];
const eventTypeOptions = [
  { value: "lead_verification", label: "Verifica Lead" },
  { value: "prime_first_activation", label: "Prima attivazione PRIME" },
  { value: "prime_renewal", label: "Rinnovo PRIME" },
  { value: "prime_lead_purchase", label: "Acquisto Lead PRIME" },
  { value: "refund_adjustment", label: "Riaccredito Lead" },
  { value: "manual_adjustment", label: "Rettifica manuale" },
];

function displayName(person: { firstName?: string | null; lastName?: string | null; email: string }) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email;
}
function eventTypeLabel(type: EventType) { return eventTypeOptions.find((item) => item.value === type)?.label ?? type; }
function statusLabel(status: EventStatus) { return status === "accrued" ? "Maturato" : status === "pending_attribution" ? "Da attribuire" : "Annullato"; }
function statusClass(status: EventStatus) { return status === "accrued" ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700" : status === "pending_attribution" ? "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700" : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600"; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

