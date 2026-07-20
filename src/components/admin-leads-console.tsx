"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Eye,
  ListChecks,
  Search,
  ShieldCheck,
  ShoppingBag,
  XCircle,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import type { AdminLeadRecord } from "@/lib/admin/lead-records";
import { formatCents } from "@/lib/config/commercial";

type AdminLeadsResponse = {
  records: AdminLeadRecord[];
  stats: {
    pending: number;
    published: number;
    sold: number;
    rejected: number;
  };
};

type FilterState = "all" | "pending" | "published" | "sold" | "rejected";

export function AdminLeadsConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [records, setRecords] = useState<AdminLeadRecord[]>([]);
  const [stats, setStats] = useState<AdminLeadsResponse["stats"]>({
    pending: 0,
    published: 0,
    sold: 0,
    rejected: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>("pending");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const filteredRecords = records.filter((record) => {
    if (filter === "pending" && !isPending(record)) return false;
    if (filter === "published" && record.requestStatus !== "published") return false;
    if (filter === "sold" && record.purchases.length === 0) return false;
    if (filter === "rejected" && record.requestStatus !== "not_publishable") return false;

    const haystack = [
      record.contact?.firstName,
      record.contact?.lastName,
      record.contact?.email,
      record.contact?.phone,
      record.property?.city,
      record.property?.province,
      record.property?.region,
      record.property?.propertyType,
      record.lead?.title,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return query.trim() ? haystack.includes(query.trim().toLowerCase()) : true;
  });

  const selectedRecord = selectedId
    ? records.find((record) => record.ownerRequestId === selectedId) ?? null
    : null;

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadRecords = useCallback(async () => {
    const token = await getAccessToken();

    setLoading(true);
    setError(null);

    if (!token) {
      setError("Sessione non disponibile. Effettua di nuovo il login.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/leads", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = (await response.json()) as Partial<AdminLeadsResponse> & {
      error?: string;
    };

    if (!response.ok) {
      setError(payload.error ?? "Non sono riuscito a caricare i lead.");
      setLoading(false);
      return;
    }

    setRecords(payload.records ?? []);
    setStats(
      payload.stats ?? {
        pending: 0,
        published: 0,
        sold: 0,
        rejected: 0,
      },
    );
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRecords();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadRecords]);

  async function approve(record: AdminLeadRecord) {
    setActionLoading(record.ownerRequestId);
    setError(null);

    const token = await getAccessToken();
    const response = await fetch(
      `/api/admin/leads/${record.ownerRequestId}/approve`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: record.lead?.title ?? buildDefaultTitle(record),
        }),
      },
    );
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Approvazione non completata.");
    } else {
      await loadRecords();
      setFilter("published");
    }

    setActionLoading(null);
  }

  async function reject(record: AdminLeadRecord) {
    const reason = rejectReason.trim();

    if (!reason) {
      setError("Inserisci una motivazione prima di scartare il lead.");
      return;
    }

    setActionLoading(record.ownerRequestId);
    setError(null);

    const token = await getAccessToken();
    const response = await fetch(`/api/admin/leads/${record.ownerRequestId}/reject`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Rifiuto non completato.");
    } else {
      setRejectReason("");
      await loadRecords();
      setFilter("rejected");
    }

    setActionLoading(null);
  }

  return (
    <div className="grid gap-5">
      <div className="admin-kpi-grid">
        <StatCard icon={Clock3} label="Pending" value={stats.pending} tone="green" />
        <StatCard
          icon={BadgeCheck}
          label="Pubblicati"
          value={stats.published}
          tone="blue"
        />
        <StatCard
          icon={ShoppingBag}
          label="Con acquisti"
          value={stats.sold}
          tone="slate"
        />
        <StatCard icon={XCircle} label="Scartati" value={stats.rejected} tone="red" />
      </div>

      <div className="card p-4">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="min-w-0">
            <p className="section-kicker flex items-center gap-2">
              <ListChecks size={15} />
              Gestione richieste
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Lead proprietari da verificare e pubblicare
            </h2>
          </div>
          <div className="grid gap-3 lg:grid-cols-[auto_280px] lg:items-center">
            <div className="admin-filter-tabs">
              {[
                ["pending", "Pending"],
                ["published", "Marketplace"],
                ["sold", "Venduti"],
                ["rejected", "Scartati"],
                ["all", "Tutti"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`admin-filter-tab ${
                    filter === value ? "admin-filter-tab-active" : ""
                  }`}
                  type="button"
                  onClick={() => setFilter(value as FilterState)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="relative block min-w-0">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                size={17}
              />
              <input
                className="filter-select min-h-11 pl-10"
                placeholder="Cerca lead, citta o proprietario"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div
        className={
          selectedRecord
            ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]"
            : "grid gap-5"
        }
      >
        <div className="card overflow-hidden">
          <div className="admin-leads-header">
            <span>Richiesta</span>
            <span>Immobile</span>
            <span>Stato</span>
            <span>Disponibilita</span>
            <span>Acquisti</span>
            <span></span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-muted">Caricamento lead...</div>
          ) : filteredRecords.length > 0 ? (
            <div className="divide-y divide-slate-200">
              {filteredRecords.map((record) => (
                <button
                  key={record.ownerRequestId}
                  className={`admin-leads-row ${
                    selectedRecord?.ownerRequestId === record.ownerRequestId
                      ? "bg-mint/35"
                      : "bg-white"
                  }`}
                  type="button"
                  onClick={() => setSelectedId(record.ownerRequestId)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {formatOwner(record)}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                      LH-{record.ownerRequestId.slice(0, 8).toUpperCase()}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {record.lead?.title ?? buildDefaultTitle(record)}
                    </p>
                    <p className="mt-1 truncate text-sm text-muted">
                      {[
                        record.property?.propertyType,
                        record.property?.city,
                        record.property?.province,
                      ]
                        .filter(Boolean)
                        .join(" - ")}
                    </p>
                  </div>
                  <StatusBadge record={record} />

                  <div className="grid gap-1 text-sm">
                    <span className="font-semibold text-ink">
                      {record.lead ? `${record.lead.sharedSlotsAvailable}/2 slot` : "2/2 slot"}
                    </span>
                    <span className="text-xs text-muted">
                      {record.lead?.exclusivePurchaseId
                        ? "Esclusiva venduta"
                        : "Esclusiva libera"}
                    </span>
                  </div>

                  <div className="grid gap-1 text-sm">
                    <span className="font-semibold text-ink">
                      {record.purchases.length > 0
                        ? `${record.purchases.length} PM`
                        : "Nessuno"}
                    </span>
                    <span className="text-xs text-muted">
                      {record.purchases[0]?.buyerCompany ??
                        record.purchases[0]?.buyerName ??
                        "Non acquistato"}
                    </span>
                  </div>

                  <span className="inline-flex items-center justify-end gap-1 text-sm font-bold text-green">
                    Dettaglio
                    <ChevronRight size={16} />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <h2 className="text-xl font-semibold text-ink">Nessun lead trovato</h2>
              <p className="mt-2 text-muted">
                Cambia filtro o cerca un termine diverso.
              </p>
            </div>
          )}
        </div>

        {selectedRecord ? (
          <LeadDetailPanel
            record={selectedRecord}
            rejectReason={rejectReason}
            onRejectReasonChange={setRejectReason}
            onApprove={approve}
            onReject={reject}
            actionLoading={actionLoading}
          />
        ) : null}
      </div>
    </div>
  );
}

function LeadDetailPanel({
  record,
  rejectReason,
  onRejectReasonChange,
  onApprove,
  onReject,
  actionLoading,
}: {
  record: AdminLeadRecord;
  rejectReason: string;
  onRejectReasonChange: (value: string) => void;
  onApprove: (record: AdminLeadRecord) => void;
  onReject: (record: AdminLeadRecord) => void;
  actionLoading: string | null;
}) {
  const canApprove = isPending(record) || record.requestStatus === "approved";
  const isBusy = actionLoading === record.ownerRequestId;

  return (
    <aside className="card h-fit p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-kicker">Dettaglio</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            {record.lead?.title ?? buildDefaultTitle(record)}
          </h2>
        </div>
        <StatusBadge record={record} />
      </div>

      <div className="mt-5 grid gap-3 text-sm">
        <InfoRow label="Proprietario" value={formatOwner(record)} />
        <InfoRow label="Email" value={record.contact?.email ?? "Non indicata"} />
        <InfoRow label="Telefono" value={record.contact?.phone ?? "Non indicato"} />
        <InfoRow
          label="Indirizzo"
          value={record.contact?.preciseAddress ?? "Non indicato"}
        />
        <InfoRow
          label="Area"
          value={[
            record.property?.city,
            record.property?.province,
            record.property?.region,
          ]
            .filter(Boolean)
            .join(", ")}
        />
        <InfoRow
          label="Immobile"
          value={`${record.property?.propertyType ?? "Immobile"} - ${
            record.property?.areaSqm ?? 0
          } mq`}
        />
        <InfoRow
          label="Camere / Bagni"
          value={`${record.property?.bedrooms ?? 0} / ${record.property?.bathrooms ?? 0}`}
        />
        <InfoRow label="Tempistica" value={record.property?.timing ?? "Non indicata"} />
      </div>

      <section className="mt-5 border-t border-slate-200 pt-5">
        <p className="text-sm font-bold text-ink">Servizi richiesti</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(record.property?.requestedServices ?? []).map((service) => (
            <span
              key={service}
              className="rounded-full bg-fog px-3 py-1 text-xs font-semibold text-ink"
            >
              {service}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-5 border-t border-slate-200 pt-5">
        <p className="text-sm font-bold text-ink">Disponibilita marketplace</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 bg-paper p-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
              Slot
            </p>
            <p className="mt-1 text-xl font-bold text-ink">
              {record.lead?.sharedSlotsAvailable ?? 2}/2
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-paper p-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
              Esclusiva
            </p>
            <p className="mt-1 text-sm font-bold text-ink">
              {record.lead?.exclusivePurchaseId ? "Acquistata" : "Disponibile"}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-5 border-t border-slate-200 pt-5">
        <p className="text-sm font-bold text-ink">Acquisti</p>
        {record.purchases.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {record.purchases.map((purchase) => (
              <div
                key={purchase.id}
                className="rounded-lg border border-slate-200 bg-paper p-3 text-sm"
              >
                <p className="font-semibold text-ink">
                  {purchase.mode === "exclusive" ? "Esclusiva" : "Condiviso"} -{" "}
                  {formatCents(purchase.amountCents)}
                </p>
                <p className="mt-1 text-muted">
                  {purchase.buyerCompany ?? purchase.buyerName ?? "PM non indicato"}
                </p>
                <p className="mt-1 text-xs text-muted">{purchase.buyerEmail}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Nessun acquisto registrato.</p>
        )}
      </section>

      <section className="mt-5 border-t border-slate-200 pt-5">
        <p className="text-sm font-bold text-ink">Note interne</p>
        <p className="mt-2 text-sm leading-6 text-muted">
          {record.qualificationNotes ?? "Nessuna nota inserita."}
        </p>
      </section>

      <div className="mt-5 grid gap-3">
        {canApprove ? (
          <button
            className="btn btn-primary w-full"
            type="button"
            disabled={isBusy}
            onClick={() => onApprove(record)}
          >
            <CheckCircle2 size={18} />
            {isBusy ? "Pubblicazione..." : "Approva e pubblica"}
          </button>
        ) : null}

        {record.requestStatus !== "not_publishable" ? (
          <div className="grid gap-2">
            <textarea
              className="min-h-24 rounded-lg border border-slate-200 bg-white p-3 text-sm text-ink outline-none focus:border-green/60 focus:ring-4 focus:ring-green/10"
              placeholder="Motivazione interna per scartare il lead"
              value={rejectReason}
              onChange={(event) => onRejectReasonChange(event.target.value)}
            />
            <button
              className="btn btn-secondary w-full"
              type="button"
              disabled={isBusy}
              onClick={() => onReject(record)}
            >
              <XCircle size={18} />
              Scarta lead
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Clock3;
  label: string;
  value: number;
  tone: "green" | "blue" | "slate" | "red";
}) {
  const tones = {
    green: "bg-mint text-green",
    blue: "bg-blue-100 text-blue-700",
    slate: "bg-slate-100 text-slate-700",
    red: "bg-red-100 text-red-700",
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted">{label}</p>
        <span className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function StatusBadge({ record }: { record: AdminLeadRecord }) {
  if (isPending(record)) {
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-mint px-3 py-1 text-xs font-bold text-green">
        <Clock3 size={14} />
        Pending
      </span>
    );
  }

  if (record.requestStatus === "published") {
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
        <ShieldCheck size={14} />
        Marketplace
      </span>
    );
  }

  if (record.requestStatus === "not_publishable") {
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
        <AlertCircle size={14} />
        Scartato
      </span>
    );
  }

  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
      <Eye size={14} />
      {record.requestStatus}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[105px_1fr] gap-3">
      <span className="font-semibold text-muted">{label}</span>
      <span className="min-w-0 break-words text-ink">{value || "Non indicato"}</span>
    </div>
  );
}

function isPending(record: AdminLeadRecord) {
  return ["pending", "to_verify"].includes(record.requestStatus);
}

function formatOwner(record: AdminLeadRecord) {
  const name = `${record.contact?.firstName ?? ""} ${record.contact?.lastName ?? ""}`.trim();

  return name || record.contact?.email || "Proprietario non indicato";
}

function buildDefaultTitle(record: AdminLeadRecord) {
  const propertyType = record.property?.propertyType ?? "Immobile";
  const place = record.property?.city ?? record.property?.province ?? record.property?.region;

  return place ? `${propertyType} a ${place}` : propertyType;
}
