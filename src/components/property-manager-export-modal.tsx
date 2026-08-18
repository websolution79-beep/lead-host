"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, Check, X } from "lucide-react";

export type PropertyManagerExportColumn =
  | "name"
  | "email"
  | "phone"
  | "accountStatus"
  | "registeredAt"
  | "lastSignInAt"
  | "emailConfirmedAt"
  | "primaryCity"
  | "managedProperties"
  | "marketingConsent"
  | "marketingConsentAt"
  | "walletBalance"
  | "topUpsCount"
  | "topUpsTotal"
  | "firstTopUpAt"
  | "lastTopUpAt"
  | "leadPurchasesCount"
  | "sharedLeadPurchasesCount"
  | "exclusiveLeadPurchasesCount"
  | "leadPurchasesTotal"
  | "firstLeadPurchaseAt"
  | "lastLeadPurchaseAt"
  | "walletCreditsTotal"
  | "marketingAddonStatus"
  | "primeStatus"
  | "primeExpiresAt";

const exportColumns: Array<{ id: PropertyManagerExportColumn; label: string }> = [
  { id: "name", label: "Nome e cognome" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Telefono" },
  { id: "accountStatus", label: "Stato account" },
  { id: "registeredAt", label: "Data iscrizione" },
  { id: "lastSignInAt", label: "Ultimo accesso" },
  { id: "emailConfirmedAt", label: "Email confermata" },
  { id: "primaryCity", label: "Città principale" },
  { id: "managedProperties", label: "Immobili gestiti" },
  { id: "marketingConsent", label: "Consenso marketing" },
  { id: "marketingConsentAt", label: "Data consenso marketing" },
  { id: "walletBalance", label: "Saldo Wallet" },
  { id: "topUpsCount", label: "Numero ricariche" },
  { id: "topUpsTotal", label: "Totale ricariche" },
  { id: "firstTopUpAt", label: "Prima ricarica" },
  { id: "lastTopUpAt", label: "Ultima ricarica" },
  { id: "leadPurchasesCount", label: "Lead acquistati" },
  { id: "sharedLeadPurchasesCount", label: "Lead condivisi acquistati" },
  { id: "exclusiveLeadPurchasesCount", label: "Lead esclusivi acquistati" },
  { id: "leadPurchasesTotal", label: "Spesa Lead" },
  { id: "firstLeadPurchaseAt", label: "Primo Lead acquistato" },
  { id: "lastLeadPurchaseAt", label: "Ultimo Lead acquistato" },
  { id: "walletCreditsTotal", label: "Riaccrediti e bonus Wallet" },
  { id: "marketingAddonStatus", label: "Modulo Marketing" },
  { id: "primeStatus", label: "Stato PRIME" },
  { id: "primeExpiresAt", label: "Scadenza PRIME" },
];

type ManagedPropertiesFilter =
  | ""
  | "starting_now"
  | "one_to_three"
  | "four_to_ten"
  | "more_than_ten"
  | "not_indicated";

export function PropertyManagerExportModal({
  open,
  profileId,
  search,
  managedProperties,
  getAccessToken,
  onClose,
}: {
  open: boolean;
  profileId: string | null | undefined;
  search: string;
  managedProperties: ManagedPropertiesFilter;
  getAccessToken: () => Promise<string | undefined>;
  onClose: () => void;
}) {
  const storageKey = useMemo(
    () => `leadhost:property-manager-export-columns:${profileId ?? "super-admin"}`,
    [profileId],
  );
  const [scope, setScope] = useState<"all" | "filtered">("all");
  const [selectedColumns, setSelectedColumns] = useState<PropertyManagerExportColumn[]>(() => {
    if (typeof window === "undefined") return exportColumns.map((column) => column.id);
    try {
      const saved = window.localStorage.getItem(storageKey);
      const parsed = saved ? (JSON.parse(saved) as unknown) : null;
      const valid = Array.isArray(parsed)
        ? parsed.filter((value): value is PropertyManagerExportColumn =>
            exportColumns.some((column) => column.id === value),
          )
        : [];
      return valid.length ? valid : exportColumns.map((column) => column.id);
    } catch {
      return exportColumns.map((column) => column.id);
    }
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const hasActiveFilters = Boolean(search || managedProperties);

  function toggleColumn(column: PropertyManagerExportColumn) {
    setSelectedColumns((current) => {
      const next = current.includes(column)
        ? current.filter((item) => item !== column)
        : [...current, column];
      if (next.length) {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      }
      return next;
    });
  }

  async function download() {
    if (!selectedColumns.length) {
      setError("Seleziona almeno una colonna da esportare.");
      return;
    }
    setIsDownloading(true);
    setError("");
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessione Super Admin non trovata.");
      const response = await fetch("/api/admin/property-managers/export", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope,
          search: scope === "filtered" ? search : "",
          managedProperties: scope === "filtered" ? managedProperties || undefined : undefined,
          columns: selectedColumns,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Non riesco a generare l'esportazione.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "lead-host-property-manager.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      onClose();
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Non riesco a generare l'esportazione.",
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end bg-ink/35 p-0 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="property-manager-export-title"
    >
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <p className="section-kicker">Esportazione protetta</p>
            <h2 id="property-manager-export-title" className="mt-1 text-xl font-semibold text-ink">
              Esporta Property Manager
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-ink"
            aria-label="Chiudi esportazione"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          <section>
            <h3 className="text-sm font-semibold text-ink">Dati da esportare</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4 transition has-[:checked]:border-green has-[:checked]:bg-green/5">
                <input
                  type="radio"
                  name="property-manager-export-scope"
                  className="mt-1 size-4 accent-green"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                />
                <span>
                  <span className="block font-semibold text-ink">Tutti i Property Manager</span>
                  <span className="mt-1 block text-sm text-muted">Esporta l&apos;intero elenco.</span>
                </span>
              </label>
              <label
                className={`flex items-start gap-3 rounded-lg border p-4 transition ${hasActiveFilters ? "cursor-pointer border-slate-200 has-[:checked]:border-green has-[:checked]:bg-green/5" : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"}`}
              >
                <input
                  type="radio"
                  name="property-manager-export-scope"
                  className="mt-1 size-4 accent-green"
                  checked={scope === "filtered"}
                  disabled={!hasActiveFilters}
                  onChange={() => setScope("filtered")}
                />
                <span>
                  <span className="block font-semibold text-ink">Solo risultati filtrati</span>
                  <span className="mt-1 block text-sm text-muted">
                    {hasActiveFilters
                      ? "Usa ricerca e filtro immobili attualmente applicati."
                      : "Applica una ricerca o un filtro per usare questa opzione."}
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-ink">Colonne</h3>
                <p className="mt-1 text-sm text-muted">I dati di fatturazione, documenti e password sono esclusi.</p>
              </div>
              <button
                type="button"
                className="text-sm font-semibold text-green hover:text-green-dark"
                onClick={() => {
                  const next =
                    selectedColumns.length === exportColumns.length
                      ? []
                      : exportColumns.map((column) => column.id);
                  setSelectedColumns(next);
                  if (next.length) window.localStorage.setItem(storageKey, JSON.stringify(next));
                }}
              >
                {selectedColumns.length === exportColumns.length ? "Deseleziona tutte" : "Seleziona tutte"}
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {exportColumns.map((column) => {
                const checked = selectedColumns.includes(column.id);
                return (
                  <label
                    key={column.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${checked ? "border-green/35 bg-green/5 text-ink" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    <input
                      className="sr-only"
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleColumn(column.id)}
                    />
                    <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded border ${checked ? "border-green bg-green text-white" : "border-slate-300 bg-white"}`}>
                      {checked ? <Check className="size-3.5" aria-hidden="true" /> : null}
                    </span>
                    {column.label}
                  </label>
                );
              })}
            </div>
          </section>

          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white p-5 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isDownloading}>
            Annulla
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void download()} disabled={isDownloading || !selectedColumns.length}>
            <ArrowDownToLine className="size-4" aria-hidden="true" />
            {isDownloading ? "Preparo il file..." : "Scarica CSV"}
          </button>
        </div>
      </div>
    </div>
  );
}
