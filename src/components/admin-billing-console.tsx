"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  FileCog,
  FileText,
  LoaderCircle,
  RefreshCcw,
  Save,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCents } from "@/lib/config/commercial";
import type {
  BillingInvoiceLine,
  BillingInvoiceStatus,
  BillingIssuerSettings,
} from "@/lib/billing/invoice-types";
import {
  PaginationControls,
  type PaginationState,
} from "@/components/pagination-controls";

type ActiveTab = "settings" | "invoices";
type SourceFilter = "all" | "wallet_top_up" | "prime_billing";
type FilterStatus =
  | "all"
  | "not_generated"
  | "ready"
  | "downloaded"
  | "imported"
  | "sent"
  | "error";

type InvoiceSummary = {
  id: string;
  status: BillingInvoiceStatus;
  provisional_number: string | null;
  document_date: string | null;
  transmission_progressive: string;
  stamp_duty_applied: boolean;
  stamp_duty_amount_cents: number;
  generation_attempts: number;
  last_error: string | null;
  final_invoice_number: string | null;
  final_invoice_date: string | null;
};

type InvoiceListRow = {
  sourceType: Exclude<SourceFilter, "all">;
  sourceId: string;
  sourceLabel: string;
  walletTransactionId: string | null;
  primeBillingPeriodId: string | null;
  profileId: string;
  propertyManagerName: string;
  propertyManagerEmail: string | null;
  amountCents: number;
  completedAt: string;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  lineItems: BillingInvoiceLine[];
  invoice: InvoiceSummary | null;
};

type InvoicesResponse = {
  storageReady: boolean;
  rows: InvoiceListRow[];
  stats: {
    completedTopUps: number;
    completedPrimePayments: number;
    ready: number;
    imported: number;
    errors: number;
  };
  pagination: PaginationState;
  error?: string;
};

const emptyPagination: PaginationState = {
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 1,
};

export function AdminBillingConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [activeTab, setActiveTab] = useState<ActiveTab>("settings");
  const [settings, setSettings] = useState<BillingIssuerSettings | null>(null);
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [stats, setStats] = useState<InvoicesResponse["stats"]>({
    completedTopUps: 0,
    completedPrimePayments: 0,
    ready: 0,
    imported: 0,
    errors: 0,
  });
  const [pagination, setPagination] = useState(emptyPagination);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<FilterStatus>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [storageReady, setStorageReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadSettings = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error("Sessione admin non trovata.");

    const response = await fetch("/api/admin/billing/settings", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      settings?: BillingIssuerSettings;
      storageReady?: boolean;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Configurazione non disponibile.");
    }

    setSettings(payload.settings ?? null);
    setStorageReady(payload.storageReady !== false);
  }, [getToken]);

  const loadInvoices = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error("Sessione admin non trovata.");

    const response = await fetch(
      `/api/admin/billing/invoices?page=${page}&pageSize=25&status=${status}&source=${source}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const payload = (await response.json()) as InvoicesResponse;

    if (!response.ok) {
      throw new Error(payload.error ?? "Archivio fatture non disponibile.");
    }

    setRows(payload.rows ?? []);
    setStats(payload.stats);
    setPagination(payload.pagination ?? emptyPagination);
    setStorageReady(payload.storageReady !== false);
  }, [getToken, page, source, status]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (activeTab === "settings") {
        await loadSettings();
      } else {
        await loadInvoices();
      }
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Caricamento non riuscito.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeTab, loadInvoices, loadSettings]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  async function saveSettings() {
    if (!settings) return;
    setWorkingId("settings");
    setError("");
    try {
      const token = await getToken();
      const response = await fetch("/api/admin/billing/settings", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });
      const payload = (await response.json()) as {
        settings?: BillingIssuerSettings;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Salvataggio non riuscito.");
      if (payload.settings) setSettings(payload.settings);
      showNotice("Configurazione di fatturazione aggiornata.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Salvataggio non riuscito.",
      );
    } finally {
      setWorkingId("");
    }
  }

  async function generateInvoice(row: InvoiceListRow) {
    const url =
      row.sourceType === "prime_billing"
        ? `/api/admin/billing/prime/${row.primeBillingPeriodId}/generate`
        : `/api/admin/billing/top-ups/${row.walletTransactionId}/generate`;
    await runInvoiceAction(
      row.sourceId,
      url,
      { method: "POST" },
      "XML FatturaPA generato.",
    );
  }

  async function downloadInvoice(invoice: InvoiceSummary) {
    setWorkingId(invoice.id);
    setError("");
    try {
      const token = await getToken();
      const response = await fetch(
        `/api/admin/billing/invoices/${invoice.id}/download`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Download XML non riuscito.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `IT01879020517_${invoice.transmission_progressive}.xml`;
      anchor.click();
      URL.revokeObjectURL(href);
      await loadInvoices();
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Download XML non riuscito.",
      );
    } finally {
      setWorkingId("");
    }
  }

  async function markImported(invoiceId: string) {
    await runInvoiceAction(
      invoiceId,
      `/api/admin/billing/invoices/${invoiceId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "imported" }),
      },
      "Fattura segnata come importata in Aruba.",
    );
  }

  async function markSent(invoiceId: string) {
    const finalInvoiceNumber = window.prompt("Numero definitivo assegnato in Aruba");
    if (!finalInvoiceNumber?.trim()) return;
    const finalInvoiceDate = window.prompt(
      "Data definitiva fattura (AAAA-MM-GG)",
      new Date().toISOString().slice(0, 10),
    );
    if (!finalInvoiceDate) return;

    await runInvoiceAction(
      invoiceId,
      `/api/admin/billing/invoices/${invoiceId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "sent",
          finalInvoiceNumber,
          finalInvoiceDate,
        }),
      },
      "Invio Aruba registrato.",
    );
  }

  async function runInvoiceAction(
    id: string,
    url: string,
    init: RequestInit,
    successMessage: string,
  ) {
    setWorkingId(id);
    setError("");
    try {
      const token = await getToken();
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Operazione non riuscita.");
      showNotice(successMessage);
      await loadInvoices();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Operazione non riuscita.",
      );
    } finally {
      setWorkingId("");
    }
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }

  return (
    <div className="grid gap-5">
      {notice ? (
        <div className="fixed right-5 top-5 z-[120] flex max-w-sm items-center gap-3 rounded-lg bg-green px-4 py-3 text-sm font-semibold text-white shadow-xl">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      ) : null}

      <div className="admin-filter-tabs w-fit">
        <TabButton
          active={activeTab === "settings"}
          label="Configurazione SOGI e Aruba"
          onClick={() => setActiveTab("settings")}
        />
        <TabButton
          active={activeTab === "invoices"}
          label="Ricariche e fatture"
          onClick={() => setActiveTab("invoices")}
        />
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          {error}
        </div>
      ) : null}

      {!storageReady ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <p className="font-semibold text-amber-900">
            Archivio fatture non ancora attivo
          </p>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            Applica la migration <strong>billing_invoices_foundation</strong>.
            I pagamenti e il Wallet continuano a funzionare normalmente.
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center">
          <LoaderCircle className="animate-spin text-green" size={28} />
        </div>
      ) : activeTab === "settings" && settings ? (
        <SettingsPanel
          settings={settings}
          saving={workingId === "settings"}
          onChange={setSettings}
          onSave={saveSettings}
        />
      ) : activeTab === "invoices" ? (
        <InvoicesPanel
          rows={rows}
          stats={stats}
          pagination={pagination}
          status={status}
          source={source}
          workingId={workingId}
          onStatusChange={(nextStatus) => {
            setPage(1);
            setStatus(nextStatus);
          }}
          onSourceChange={(nextSource) => {
            setPage(1);
            setSource(nextSource);
          }}
          onPageChange={setPage}
          onRefresh={refresh}
          onGenerate={generateInvoice}
          onDownload={downloadInvoice}
          onImported={markImported}
          onSent={markSent}
        />
      ) : null}
    </div>
  );
}

function SettingsPanel({
  settings,
  saving,
  onChange,
  onSave,
}: {
  settings: BillingIssuerSettings;
  saving: boolean;
  onChange: (settings: BillingIssuerSettings) => void;
  onSave: () => void;
}) {
  const update = <K extends keyof BillingIssuerSettings>(
    key: K,
    value: BillingIssuerSettings[K],
  ) => onChange({ ...settings, [key]: value });

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-kicker flex items-center gap-2">
            <FileCog size={15} />
            Dati emittente e formato XML
          </p>
          <h2 className="mt-2 text-xl font-semibold text-ink">
            Configurazione fiscale SOGI
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Questi dati vengono copiati nello snapshot di ogni fattura. Il bollo
            da 2,00 € è sempre assorbito da SOGI e non aumenta la ricarica.
          </p>
        </div>
        <button className="btn btn-primary" disabled={saving} onClick={onSave}>
          {saving ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}
          Salva configurazione
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Ragione sociale" value={settings.legalName} onChange={(v) => update("legalName", v)} />
        <Field label="Partita IVA" value={settings.vatNumber} onChange={(v) => update("vatNumber", v)} />
        <Field label="Codice fiscale" value={settings.fiscalCode} onChange={(v) => update("fiscalCode", v)} />
        <Field label="Indirizzo" value={settings.addressLine} onChange={(v) => update("addressLine", v)} />
        <Field label="CAP" value={settings.postalCode} onChange={(v) => update("postalCode", v)} />
        <Field label="Città" value={settings.city} onChange={(v) => update("city", v)} />
        <Field label="Provincia" value={settings.province} onChange={(v) => update("province", v)} />
        <Field label="Email" type="email" value={settings.email} onChange={(v) => update("email", v)} />
        <Field label="ID trasmittente Aruba" value={settings.arubaTransmitterTaxCode} onChange={(v) => update("arubaTransmitterTaxCode", v)} />
        <Field label="Prefisso numero provvisorio" value={settings.provisionalNumberPrefix} onChange={(v) => update("provisionalNumberPrefix", v)} />
        <Field label="Descrizione riga" value={settings.lineDescription} onChange={(v) => update("lineDescription", v)} />
        <ReadOnlyField label="Regime fiscale" value={`${settings.taxRegime} - Forfettario`} />
        <ReadOnlyField label="Natura IVA" value={`${settings.vatNature} - IVA 0%`} />
        <ReadOnlyField label="Formato / documento" value={`${settings.transmissionFormat} / ${settings.documentType}`} />
        <ReadOnlyField label="Pagamento" value={`${settings.paymentMethod} - Carta`} />
        <ReadOnlyField label="Bollo virtuale" value="2,00 € assorbiti da SOGI" />
      </div>

      <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <input
          className="mt-1 size-4 accent-green"
          type="checkbox"
          checked={settings.autoGenerateInvoices}
          onChange={(event) =>
            update("autoGenerateInvoices", event.target.checked)
          }
        />
        <span>
          <span className="block font-semibold text-ink">
            Genera automaticamente l’XML dopo un pagamento Stripe completato
          </span>
          <span className="mt-1 block text-sm leading-6 text-muted">
            Vale per ricariche Wallet e pagamenti PRIME. Un eventuale errore XML
            non blocca mai il pagamento, l’accredito Wallet o l’attivazione del servizio.
          </span>
        </span>
      </label>
    </section>
  );
}

function InvoicesPanel({
  rows,
  stats,
  pagination,
  status,
  source,
  workingId,
  onStatusChange,
  onSourceChange,
  onPageChange,
  onRefresh,
  onGenerate,
  onDownload,
  onImported,
  onSent,
}: {
  rows: InvoiceListRow[];
  stats: InvoicesResponse["stats"];
  pagination: PaginationState;
  status: FilterStatus;
  source: SourceFilter;
  workingId: string;
  onStatusChange: (status: FilterStatus) => void;
  onSourceChange: (source: SourceFilter) => void;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  onGenerate: (row: InvoiceListRow) => void;
  onDownload: (invoice: InvoiceSummary) => void;
  onImported: (invoiceId: string) => void;
  onSent: (invoiceId: string) => void;
}) {
  return (
    <>
      <div className="admin-kpi-grid">
        <Stat label="Ricariche Wallet" value={stats.completedTopUps} />
        <Stat label="Pagamenti PRIME" value={stats.completedPrimePayments} />
        <Stat label="XML pronti" value={stats.ready} />
        <Stat label="Importate / inviate" value={stats.imported} />
        <Stat label="Da controllare" value={stats.errors} alert={stats.errors > 0} />
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-4">
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "Tutte le origini"],
                  ["wallet_top_up", "Wallet"],
                  ["prime_billing", "PRIME"],
                ] as [SourceFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={source === value ? "btn btn-primary" : "btn btn-secondary"}
                  type="button"
                  onClick={() => onSourceChange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "Tutte"],
                ["not_generated", "Da generare"],
                ["ready", "Pronte"],
                ["imported", "Importate"],
                ["sent", "Inviate"],
                ["error", "Errori"],
              ] as [FilterStatus, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                className={status === value ? "btn btn-primary" : "btn btn-secondary"}
                type="button"
                onClick={() => onStatusChange(value)}
              >
                {label}
              </button>
            ))}
            </div>
          </div>
          <button className="btn btn-secondary" type="button" onClick={onRefresh}>
            <RefreshCcw size={16} />
            Aggiorna
          </button>
        </div>

        <div className="grid gap-3 p-4">
          {rows.length ? (
            rows.map((row) => (
              <article
                key={`${row.sourceType}:${row.sourceId}`}
                className="grid gap-4 rounded-lg border border-slate-200 p-4 xl:grid-cols-[1.3fr_0.8fr_0.8fr_auto] xl:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink">
                      {row.propertyManagerName}
                    </h3>
                    <InvoiceStatusBadge invoice={row.invoice} />
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        row.sourceType === "prime_billing"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      {row.sourceLabel}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted">
                    {row.propertyManagerEmail ?? "Email non disponibile"}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {formatDateTime(row.completedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">Importo</p>
                  <p className="mt-1 text-lg font-semibold text-ink">
                    {formatCents(row.amountCents)}
                  </p>
                  {row.invoice?.stamp_duty_applied ? (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      Bollo 2,00 € assorbito da SOGI
                    </p>
                  ) : null}
                  {row.lineItems.length > 1 ? (
                    <div className="mt-2 grid gap-1">
                      {row.lineItems.map((line) => (
                        <p key={line.code} className="text-xs text-slate-600">
                          {line.description}: <strong>{formatCents(line.amountCents)}</strong>
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Pagamento Stripe
                  </p>
                  <p className="mt-1 break-all text-xs font-medium text-slate-700">
                    {row.stripePaymentIntentId ?? "ID non disponibile"}
                  </p>
                  {row.invoice?.final_invoice_number ? (
                    <p className="mt-2 text-xs font-semibold text-green">
                      Fattura {row.invoice.final_invoice_number}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 xl:max-w-72 xl:justify-end">
                  {!row.invoice || row.invoice.status === "error" ? (
                    <ActionButton
                      loading={workingId === row.sourceId}
                      label={row.invoice ? "Rigenera XML" : "Genera XML"}
                      icon={<FileText size={16} />}
                      onClick={() => onGenerate(row)}
                    />
                  ) : null}
                  {row.invoice &&
                  ["ready", "downloaded", "imported"].includes(
                    row.invoice.status,
                  ) ? (
                    <ActionButton
                      loading={workingId === row.invoice.id}
                      label="Scarica XML"
                      icon={<Download size={16} />}
                      onClick={() => onDownload(row.invoice!)}
                    />
                  ) : null}
                  {row.invoice &&
                  ["ready", "downloaded"].includes(row.invoice.status) ? (
                    <ActionButton
                      loading={workingId === row.invoice.id}
                      label="Importata in Aruba"
                      icon={<FileCheck2 size={16} />}
                      secondary
                      onClick={() => onImported(row.invoice!.id)}
                    />
                  ) : null}
                  {row.invoice?.status === "imported" ? (
                    <ActionButton
                      loading={workingId === row.invoice.id}
                      label="Registra invio"
                      icon={<CheckCircle2 size={16} />}
                      onClick={() => onSent(row.invoice!.id)}
                    />
                  ) : null}
                </div>
                {row.invoice?.last_error ? (
                  <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 xl:col-span-4">
                    {row.invoice.last_error}
                  </p>
                ) : null}
              </article>
            ))
          ) : (
            <div className="py-12 text-center">
              <FileText className="mx-auto text-slate-300" size={32} />
              <p className="mt-3 font-semibold text-ink">
                Nessun pagamento in questo stato
              </p>
            </div>
          )}
        </div>
        <PaginationControls
          pagination={pagination}
          disabled={Boolean(workingId)}
          onPageChange={onPageChange}
        />
      </section>
    </>
  );
}

function Field({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <input
        className="input"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${alert ? "text-red-600" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

function InvoiceStatusBadge({ invoice }: { invoice: InvoiceSummary | null }) {
  const status = invoice?.status ?? "not_generated";
  const labels: Record<string, string> = {
    not_generated: "Da generare",
    pending: "In attesa",
    generating: "Generazione",
    ready: "XML pronto",
    downloaded: "Scaricato",
    imported: "Importato in Aruba",
    sent: "Inviato",
    error: "Errore XML",
    cancelled: "Annullato",
  };
  const color =
    status === "error"
      ? "bg-red-50 text-red-700"
      : status === "sent"
        ? "bg-emerald-100 text-emerald-800"
        : ["ready", "downloaded", "imported"].includes(status)
          ? "bg-blue-50 text-blue-700"
          : "bg-slate-100 text-slate-700";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${color}`}>
      {labels[status] ?? status}
    </span>
  );
}

function ActionButton({
  label,
  icon,
  loading,
  secondary = false,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  secondary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={secondary ? "btn btn-secondary" : "btn btn-primary"}
      type="button"
      disabled={loading}
      onClick={onClick}
    >
      {loading ? <LoaderCircle className="animate-spin" size={16} /> : icon}
      {label}
    </button>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "btn btn-primary" : "btn btn-secondary"}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
