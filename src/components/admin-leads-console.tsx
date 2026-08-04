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
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  ShoppingBag,
  Tag,
  TimerOff,
  XCircle,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { ADMIN_NEW_LEADS_COUNT_EVENT } from "@/components/admin-lead-nav-badge";
import { AdminLeadEditorModal } from "@/components/admin-lead-editor-modal";
import { AdminNewLeadsPipeline } from "@/components/admin-new-leads-pipeline";
import { useAppSession } from "@/components/app-session-provider";
import type { AdminLeadRecord } from "@/lib/admin/lead-records";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { formatCents } from "@/lib/config/commercial";
import {
  getMissingLeadFields,
  type MissingLeadField,
} from "@/lib/owner-requests/completeness";

type AdminLeadsResponse = {
  records: AdminLeadRecord[];
  stats: {
    waitingCompletion: number;
    duplicates: number;
    newLeads: number;
    pending: number;
    published: number;
    sold: number;
    expired: number;
    rejected: number;
  };
};

type FilterState =
  | "all"
  | "completion"
  | "duplicates"
  | "new"
  | "pending"
  | "published"
  | "sold"
  | "expired"
  | "rejected";

type ApprovalPriceDraft = {
  sharedPriceCents: number;
  exclusivePriceCents: number;
  ownerVerified: boolean;
  pricesCustomized: boolean;
};

export function AdminLeadsConsole() {
  const session = useAppSession();
  const canManageLeads =
    Boolean(session.isSuperAdmin) ||
    hasAdminPermission(session.adminPermissions ?? {}, "leads", "write");
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [records, setRecords] = useState<AdminLeadRecord[]>([]);
  const [stats, setStats] = useState<AdminLeadsResponse["stats"]>({
    waitingCompletion: 0,
    duplicates: 0,
    newLeads: 0,
    pending: 0,
    published: 0,
    sold: 0,
    expired: 0,
    rejected: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [publishWarningId, setPublishWarningId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>("new");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [approvalDrafts, setApprovalDrafts] = useState<Record<string, ApprovalPriceDraft>>(
    {},
  );

  const filteredRecords = records.filter((record) => {
    if (filter === "completion" && record.requestStatus !== "waiting_for_completion") {
      return false;
    }
    if (filter === "duplicates" && !hasDuplicateWarning(record)) return false;
    if (filter === "new" && !isNewLead(record)) return false;
    if (filter === "pending" && !isPendingLead(record)) return false;
    if (filter === "published" && record.requestStatus !== "published") return false;
    if (filter === "sold" && record.purchases.length === 0) return false;
    if (filter === "expired" && !isExpiredLead(record)) return false;
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
      record.property?.description,
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
  const editingRecord = editingId
    ? records.find((record) => record.ownerRequestId === editingId) ?? null
    : null;
  const publishWarningRecord = publishWarningId
    ? records.find((record) => record.ownerRequestId === publishWarningId) ?? null
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
    const nextStats =
      payload.stats ?? {
        waitingCompletion: 0,
        duplicates: 0,
        newLeads: 0,
        pending: 0,
        published: 0,
        sold: 0,
        expired: 0,
        rejected: 0,
      };
    setStats(nextStats);
    window.dispatchEvent(
      new CustomEvent(ADMIN_NEW_LEADS_COUNT_EVENT, {
        detail: nextStats.newLeads,
      }),
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
    const priceDraft = getApprovalDraft(record);

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
          sharedPriceCents: priceDraft.sharedPriceCents,
          exclusivePriceCents: priceDraft.exclusivePriceCents,
          ownerVerified: priceDraft.ownerVerified,
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

  function requestApproval(record: AdminLeadRecord) {
    const missingFields = getMissingLeadFields(record);

    if (missingFields.length) {
      setPublishWarningId(record.ownerRequestId);
      return;
    }

    void approve(record);
  }

  function selectRecord(record: AdminLeadRecord) {
    setSelectedId(record.ownerRequestId);
    setActionReason("");
    setApprovalDrafts((current) => ({
      ...current,
      [record.ownerRequestId]: current[record.ownerRequestId] ?? {
        sharedPriceCents: record.pricing.sharedPriceCents,
        exclusivePriceCents: record.pricing.exclusivePriceCents,
        ownerVerified: record.ownerVerified,
        pricesCustomized: Boolean(record.lead),
      },
    }));
  }

  function getApprovalDraft(record: AdminLeadRecord) {
    return (
      approvalDrafts[record.ownerRequestId] ?? {
        sharedPriceCents: record.pricing.sharedPriceCents,
        exclusivePriceCents: record.pricing.exclusivePriceCents,
        ownerVerified: record.ownerVerified,
        pricesCustomized: Boolean(record.lead),
      }
    );
  }

  function updateApprovalDraft(
    record: AdminLeadRecord,
    update: Partial<ApprovalPriceDraft>,
  ) {
    setApprovalDrafts((current) => ({
      ...current,
      [record.ownerRequestId]: mergeApprovalDraft(
        record,
        current[record.ownerRequestId] ?? getApprovalDraft(record),
        update,
      ),
    }));
  }

  async function reject(record: AdminLeadRecord) {
    const reason = actionReason.trim();

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
      setActionReason("");
      await loadRecords();
      setFilter("rejected");
    }

    setActionLoading(null);
  }

  async function moveToStatus(
    record: AdminLeadRecord,
    status: "pending" | "to_verify",
  ) {
    const reason = actionReason.trim();

    if (status === "pending" && reason.length < 3) {
      setError("Inserisci una motivazione prima di spostare il lead in Pending.");
      return;
    }

    setActionLoading(record.ownerRequestId);
    setError(null);

    const token = await getAccessToken();
    const response = await fetch(`/api/admin/leads/${record.ownerRequestId}/status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status, reason: reason || undefined }),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Cambio stato non completato.");
    } else {
      setActionReason("");
      setSelectedId(null);
      await loadRecords();
      setFilter(status === "pending" ? "pending" : "new");
    }

    setActionLoading(null);
  }

  return (
    <div className="grid gap-5">
      <div className="admin-kpi-grid">
        <StatCard
          icon={Clock3}
          label="Da completare"
          value={stats.waitingCompletion}
          tone="amber"
        />
        <StatCard
          icon={AlertCircle}
          label="Possibili duplicati"
          value={stats.duplicates}
          tone="red"
        />
        <StatCard icon={ListChecks} label="Nuovi Lead" value={stats.newLeads} tone="green" />
        <StatCard icon={Clock3} label="Pending" value={stats.pending} tone="amber" />
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
        <StatCard
          icon={TimerOff}
          label="Lead scaduti"
          value={stats.expired}
          tone="amber"
        />
        <StatCard icon={XCircle} label="Scartati" value={stats.rejected} tone="red" />
      </div>

      <div className="card p-4">
        <div className="grid gap-4">
          <div className="min-w-0">
            <p className="section-kicker flex items-center gap-2">
              <ListChecks size={15} />
              Gestione richieste
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Lead proprietari da verificare e pubblicare
            </h2>
          </div>
          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] xl:items-center">
            <div className="admin-filter-tabs">
              {[
                ["completion", "Da completare"],
                ["duplicates", "Duplicati"],
                ["new", "Nuovi Lead"],
                ["pending", "Pending"],
                ["published", "Marketplace"],
                ["sold", "Venduti"],
                ["expired", "Scaduti"],
                ["rejected", "Scartati"],
                ["all", "Tutti"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`admin-filter-tab ${
                    filter === value ? "admin-filter-tab-active" : ""
                  }`}
                  type="button"
                  onClick={() => {
                    setFilter(value as FilterState);
                    setSelectedId(null);
                  }}
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
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedId(null);
                }}
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
        {filter === "new" ? (
          <AdminNewLeadsPipeline
            records={filteredRecords}
            canManage={canManageLeads}
            onOpenDetail={selectRecord}
            onChanged={loadRecords}
          />
        ) : (
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
                <div
                  key={record.ownerRequestId}
                  className={`admin-leads-row ${
                    selectedRecord?.ownerRequestId === record.ownerRequestId
                      ? "bg-mint/35"
                      : "bg-white"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {formatOwner(record)}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                      LH-{record.ownerRequestId.slice(0, 8).toUpperCase()}
                    </p>
                    {hasDuplicateWarning(record) ? (
                      <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700">
                        <AlertCircle size={12} />
                        Possibile duplicato
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">
                        {record.lead?.title ?? buildDefaultTitle(record)}
                      </p>
                      <LeadTypeBadge ownerVerified={record.ownerVerified} />
                    </div>
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

                  <button
                    className="inline-flex items-center justify-end gap-1 text-sm font-bold text-green"
                    type="button"
                    onClick={() => selectRecord(record)}
                  >
                    Dettaglio
                    <ChevronRight size={16} />
                  </button>
                </div>
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
        )}

        {selectedRecord ? (
          <LeadDetailPanel
            record={selectedRecord}
            canManage={canManageLeads}
            actionReason={actionReason}
            onActionReasonChange={setActionReason}
            onApprove={requestApproval}
            onReject={reject}
            onMoveToStatus={moveToStatus}
            onEdit={() => setEditingId(selectedRecord.ownerRequestId)}
            onClose={() => setSelectedId(null)}
            approvalDraft={getApprovalDraft(selectedRecord)}
            onApprovalDraftChange={(update) => updateApprovalDraft(selectedRecord, update)}
            actionLoading={actionLoading}
          />
        ) : null}
      </div>

      {editingRecord ? (
        <AdminLeadEditorModal
          record={editingRecord}
          approvalDraft={getApprovalDraft(editingRecord)}
          onApprovalDraftChange={(update) =>
            updateApprovalDraft(editingRecord, update)
          }
          onClose={() => setEditingId(null)}
          onSaved={loadRecords}
        />
      ) : null}

      {publishWarningRecord ? (
        <PublishWarningModal
          record={publishWarningRecord}
          onClose={() => setPublishWarningId(null)}
          onEdit={() => {
            setPublishWarningId(null);
            setEditingId(publishWarningRecord.ownerRequestId);
          }}
          onPublish={() => {
            setPublishWarningId(null);
            void approve(publishWarningRecord);
          }}
        />
      ) : null}
    </div>
  );
}

function LeadDetailPanel({
  record,
  canManage,
  actionReason,
  onActionReasonChange,
  onApprove,
  onReject,
  onMoveToStatus,
  onEdit,
  onClose,
  approvalDraft,
  onApprovalDraftChange,
  actionLoading,
}: {
  record: AdminLeadRecord;
  canManage: boolean;
  actionReason: string;
  onActionReasonChange: (value: string) => void;
  onApprove: (record: AdminLeadRecord) => void;
  onReject: (record: AdminLeadRecord) => void;
  onMoveToStatus: (
    record: AdminLeadRecord,
    status: "pending" | "to_verify",
  ) => void;
  onEdit: () => void;
  onClose: () => void;
  approvalDraft: ApprovalPriceDraft;
  onApprovalDraftChange: (update: Partial<ApprovalPriceDraft>) => void;
  actionLoading: string | null;
}) {
  const canApprove =
    canManage &&
    (isNewLead(record) ||
      isPendingLead(record) ||
      record.requestStatus === "approved");
  const isBusy = actionLoading === record.ownerRequestId;
  const canEdit = canManage && canEditRequest(record);
  const missingFields = getMissingLeadFields(record);

  return (
    <aside className="card h-fit p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-kicker">Dettaglio</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            {record.lead?.title ?? buildDefaultTitle(record)}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge record={record} />
          {canEdit ? (
            <button
              className="icon-button min-h-9 px-2"
              type="button"
              aria-label="Modifica informazioni"
              title="Modifica informazioni"
              onClick={onEdit}
            >
              <Pencil size={16} />
            </button>
          ) : null}
          <button
            className="icon-button min-h-9 px-2"
            type="button"
            aria-label="Chiudi dettaglio"
            onClick={onClose}
          >
            <XCircle size={16} />
          </button>
        </div>
      </div>

      <div
        className={`mt-4 rounded-lg border p-3 ${
          missingFields.length
            ? "border-amber-200 bg-amber-50"
            : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            className={`text-sm font-bold ${
              missingFields.length ? "text-amber-900" : "text-emerald-800"
            }`}
          >
            {missingFields.length
              ? `${missingFields.length} informazioni mancanti`
              : "Informazioni complete"}
          </p>
          {canEdit ? (
            <button
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800"
              type="button"
              onClick={onEdit}
            >
              <Pencil size={14} />
              Modifica informazioni
            </button>
          ) : null}
        </div>
        {missingFields.length ? (
          <p className="mt-2 text-xs leading-5 text-amber-800">
            {missingFields
              .slice(0, 5)
              .map((field) => field.label)
              .join(", ")}
            {missingFields.length > 5
              ? ` e altre ${missingFields.length - 5}`
              : ""}
            .
          </p>
        ) : null}
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
        <InfoRow
          label="Tipologia lead"
          value={record.ownerVerified ? "Lead verificato" : "Lead in target"}
        />
        <InfoRow
          label="Consensi"
          value={[
            record.consents.privacy ? "Privacy" : null,
            record.consents.dataSharing ? "Condivisione dati" : null,
            record.consents.marketing ? "Marketing" : null,
          ]
            .filter(Boolean)
            .join(", ")}
        />
      </div>

      <section className="mt-5 border-t border-slate-200 pt-5">
        <p className="text-sm font-bold text-ink">Controllo duplicati</p>
        <DuplicateCheckBox record={record} />
      </section>

      <section className="mt-5 border-t border-slate-200 pt-5">
        <p className="text-sm font-bold text-ink">Servizi richiesti</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(record.property?.requestedServices ?? []).length > 0 ? (
            (record.property?.requestedServices ?? []).map((service) => (
              <span
                key={service}
                className="rounded-full bg-fog px-3 py-1 text-xs font-semibold text-ink"
              >
                {service}
              </span>
            ))
          ) : (
            <p className="text-sm text-muted">Nessun servizio selezionato.</p>
          )}
        </div>
      </section>

      <section className="mt-5 border-t border-slate-200 pt-5">
        <p className="text-sm font-bold text-ink">Note facoltative proprietario</p>
        <p className="mt-2 whitespace-pre-line rounded-xl border border-slate-200 bg-paper p-3 text-sm leading-6 text-muted">
          {record.property?.description?.trim() || "Nessuna nota facoltativa inserita."}
        </p>
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

      {canApprove ? (
        <section className="mt-5 border-t border-slate-200 pt-5">
          <label className="mb-4 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <input
              className="mt-0.5 size-4 accent-blue-600"
              type="checkbox"
              checked={approvalDraft.ownerVerified}
              onChange={(event) =>
                onApprovalDraftChange({ ownerVerified: event.target.checked })
              }
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-blue-900">
                Proprietario verificato
              </span>
              <span className="mt-1 block text-xs leading-5 text-blue-800">
                Seleziona solo dopo la verifica telefonica. Il badge sarà visibile nel
                Marketplace.
              </span>
            </span>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-ink">Prezzi pubblicazione</p>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {approvalDraft.pricesCustomized
                ? "Prezzo personalizzato"
                : approvalDraft.ownerVerified
                  ? record.pricingByType.verified.label
                  : record.pricingByType.inTarget.label}
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <PriceInput
              label="Condiviso"
              valueCents={approvalDraft.sharedPriceCents}
              onChange={(value) =>
                onApprovalDraftChange({
                  sharedPriceCents: value,
                  pricesCustomized: true,
                })
              }
            />
            <PriceInput
              label="Esclusivo"
              valueCents={approvalDraft.exclusivePriceCents}
              onChange={(value) =>
                onApprovalDraftChange({
                  exclusivePriceCents: value,
                  pricesCustomized: true,
                })
              }
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">
            La regola geografica prevale sul default della tipologia. Puoi comunque
            personalizzare entrambi i prezzi per questo lead.
          </p>
        </section>
      ) : null}

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

      {record.statusReason ? (
        <section className="mt-5 border-t border-slate-200 pt-5">
          <p className="text-sm font-bold text-ink">Motivazione stato</p>
          <p className="mt-2 whitespace-pre-line rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            {record.statusReason}
          </p>
          {record.statusChangedAt ? (
            <p className="mt-2 text-xs text-muted">
              Aggiornato il {formatDateTime(record.statusChangedAt)}
            </p>
          ) : null}
        </section>
      ) : null}

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

        {canManage && (isNewLead(record) || isPendingLead(record)) ? (
          <div className="grid gap-2">
            <textarea
              className="min-h-24 rounded-lg border border-slate-200 bg-white p-3 text-sm text-ink outline-none focus:border-green/60 focus:ring-4 focus:ring-green/10"
              placeholder="Motivazione interna per Pending o scarto"
              value={actionReason}
              onChange={(event) => onActionReasonChange(event.target.value)}
            />
            {isNewLead(record) ? (
              <button
                className="btn btn-secondary w-full"
                type="button"
                disabled={isBusy}
                onClick={() => onMoveToStatus(record, "pending")}
              >
                <Clock3 size={18} />
                Sposta in Pending
              </button>
            ) : null}
            {isPendingLead(record) ? (
              <button
                className="btn btn-secondary w-full"
                type="button"
                disabled={isBusy}
                onClick={() => onMoveToStatus(record, "to_verify")}
              >
                <ListChecks size={18} />
                Sposta in Nuovi Lead
              </button>
            ) : null}
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

        {record.requestStatus === "not_publishable" ? (
          <button
            className="btn btn-secondary w-full"
            type="button"
            disabled={isBusy}
            onClick={() => onMoveToStatus(record, "to_verify")}
          >
            <ListChecks size={18} />
            Ripristina in Nuovi Lead
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function PublishWarningModal({
  record,
  onClose,
  onEdit,
  onPublish,
}: {
  record: AdminLeadRecord;
  onClose: () => void;
  onEdit: () => void;
  onPublish: () => void;
}) {
  const missingFields = getMissingLeadFields(record);
  const groupedFields = groupMissingFields(missingFields);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end bg-slate-950/50 sm:items-center sm:justify-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-warning-title"
    >
      <div className="max-h-[100dvh] w-full overflow-y-auto bg-white shadow-2xl sm:max-w-xl sm:rounded-lg">
        <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-amber-100 p-2 text-amber-700">
              <AlertCircle size={20} />
            </span>
            <div className="min-w-0">
              <p className="section-kicker">Verifica pubblicazione</p>
              <h2
                className="mt-1 text-xl font-semibold text-ink"
                id="publish-warning-title"
              >
                Il lead presenta informazioni mancanti
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Puoi completarle adesso oppure pubblicare comunque il lead nel
                marketplace.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-5 py-5 sm:px-6">
          {groupedFields.map((group) => (
            <section
              className="rounded-lg border border-slate-200 bg-paper p-4"
              key={group.label}
            >
              <p className="text-xs font-bold uppercase text-slate-500">
                {group.label}
              </p>
              <ul className="mt-2 grid gap-1 text-sm text-ink">
                {group.fields.map((field) => (
                  <li className="flex items-start gap-2" key={field.key}>
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500" />
                    {field.label}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {!record.contact?.email || !record.contact?.phone ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold leading-6 text-red-700">
              Attenzione: dopo l&apos;acquisto il Property Manager potrebbe non
              trovare tutti i dati necessari per contattare il proprietario.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Annulla
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={onEdit}
          >
            <Pencil size={17} />
            Modifica informazioni
          </button>
          <button className="btn btn-primary" type="button" onClick={onPublish}>
            <CheckCircle2 size={17} />
            Pubblica comunque
          </button>
        </div>
      </div>
    </div>
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
  tone: "green" | "blue" | "slate" | "amber" | "red";
}) {
  const tones = {
    green: "bg-mint text-green",
    blue: "bg-blue-100 text-blue-700",
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-700",
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
  if (record.requestStatus === "waiting_for_completion") {
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
        <Clock3 size={14} />
        Da completare
      </span>
    );
  }

  if (isNewLead(record)) {
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-mint px-3 py-1 text-xs font-bold text-green">
        <ListChecks size={14} />
        Nuovo Lead
      </span>
    );
  }

  if (isPendingLead(record)) {
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
        <Clock3 size={14} />
        Pending
      </span>
    );
  }

  if (isExpiredLead(record)) {
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
        <TimerOff size={14} />
        Scaduto
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

function LeadTypeBadge({ ownerVerified }: { ownerVerified: boolean }) {
  return ownerVerified ? (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
      <Sparkles size={13} />
      Premium
    </span>
  ) : (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
      <Tag size={13} />
      Standard
    </span>
  );
}

function DuplicateCheckBox({ record }: { record: AdminLeadRecord }) {
  const duplicateCheck = record.duplicateCheck;

  if (duplicateCheck.status === "clear") {
    return (
      <p className="mt-2 rounded-xl border border-green/15 bg-green/5 p-3 text-sm font-semibold text-green">
        Nessun duplicato rilevato.
      </p>
    );
  }

  if (duplicateCheck.status === "unchecked") {
    return (
      <p className="mt-2 rounded-xl border border-slate-200 bg-paper p-3 text-sm text-muted">
        Controllo non disponibile per questa richiesta.
      </p>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-bold text-red-700">
        {duplicateCheck.status === "duplicate"
          ? "Duplicato probabile"
          : "Possibile duplicato"}{" "}
        ({duplicateCheck.highestScore}%)
      </p>
      <div className="mt-3 grid gap-2">
        {duplicateCheck.matches.map((match) => (
          <div key={match.ownerRequestId} className="rounded-lg bg-white p-3 text-sm">
            <p className="font-semibold text-ink">
              LH-{match.ownerRequestId.slice(0, 8).toUpperCase()} - {match.score}%
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Stato: {match.status}
            </p>
            {match.reasons.length ? (
              <ul className="mt-2 grid gap-1 text-xs font-semibold text-red-700">
                {match.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </div>
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

function PriceInput({
  label,
  valueCents,
  onChange,
}: {
  label: string;
  valueCents: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">
      {label}
      <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3 focus-within:border-green/60">
        <span className="pr-2 text-sm font-semibold text-slate-500">EUR</span>
        <input
          className="min-h-10 w-full bg-transparent text-sm font-semibold text-ink outline-none"
          inputMode="decimal"
          value={valueCents / 100}
          onChange={(event) => onChange(parseEuroCents(event.target.value))}
        />
      </div>
    </label>
  );
}

function parseEuroCents(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const amount = Number.parseFloat(normalized);

  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

function isNewLead(record: AdminLeadRecord) {
  return record.requestStatus === "to_verify";
}

function mergeApprovalDraft(
  record: AdminLeadRecord,
  current: ApprovalPriceDraft,
  update: Partial<ApprovalPriceDraft>,
): ApprovalPriceDraft {
  const typeChanged =
    typeof update.ownerVerified === "boolean" &&
    update.ownerVerified !== current.ownerVerified;
  const priceChanged =
    update.sharedPriceCents !== undefined ||
    update.exclusivePriceCents !== undefined;

  if (typeChanged && !current.pricesCustomized && !priceChanged) {
    const suggestion = update.ownerVerified
      ? record.pricingByType.verified
      : record.pricingByType.inTarget;

    return {
      ownerVerified: Boolean(update.ownerVerified),
      sharedPriceCents: suggestion.sharedPriceCents,
      exclusivePriceCents: suggestion.exclusivePriceCents,
      pricesCustomized: false,
    };
  }

  return {
    ...current,
    ...update,
    pricesCustomized:
      update.pricesCustomized ?? (current.pricesCustomized || priceChanged),
  };
}

function isPendingLead(record: AdminLeadRecord) {
  return record.requestStatus === "pending";
}

function canEditRequest(record: AdminLeadRecord) {
  return [
    "new_from_meta",
    "waiting_for_completion",
    "completed",
    "pending",
    "to_verify",
    "approved",
    "published",
  ].includes(record.requestStatus);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function groupMissingFields(fields: MissingLeadField[]) {
  const labels: Record<MissingLeadField["group"], string> = {
    proprietario: "Dati proprietario",
    immobile: "Dati immobile",
    consensi: "Consensi",
  };

  return (Object.keys(labels) as MissingLeadField["group"][])
    .map((group) => ({
      label: labels[group],
      fields: fields.filter((field) => field.group === group),
    }))
    .filter((group) => group.fields.length);
}

function hasDuplicateWarning(record: AdminLeadRecord) {
  return ["duplicate", "possible_duplicate"].includes(record.duplicateCheck.status);
}

function isExpiredLead(record: AdminLeadRecord) {
  const lead = record.lead;

  if (!lead) return false;
  if (lead.internalStatus === "withdrawn_after_7_days") return true;
  if (!["available", "one_slot_sold"].includes(lead.internalStatus)) return false;
  if (!lead.expiresAt) return false;

  return new Date(lead.expiresAt).getTime() <= Date.now();
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
