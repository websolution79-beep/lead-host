"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FolderPlus, Plus, X } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import type { RevenueEstimate } from "@/components/marketing-revenue-estimates";

type TemplateIdentity = {
  brand_name: string | null;
  header_text: string | null;
  contact_details: string | null;
  logo_path: string | null;
};

type CrmContact = {
  id: string;
  full_name: string;
  city: string | null;
  property_address: string | null;
  property_type: string | null;
};

export function MarketingRevenueReport({ estimateId }: { estimateId: string }) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [estimate, setEstimate] = useState<RevenueEstimate | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [templateIdentity, setTemplateIdentity] =
    useState<TemplateIdentity | null>(null);
  const [templateLogoUrl, setTemplateLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [crmContacts, setCrmContacts] = useState<CrmContact[]>([]);
  const [crmDialogOpen, setCrmDialogOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const load = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) {
      setError("Sessione non disponibile.");
      return;
    }
    const [response, templateResponse, crmResponse] = await Promise.all([
      fetch("/api/marketing/revenue-estimates", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
      fetch("/api/marketing/revenue-template", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
      fetch("/api/marketing/crm", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
    ]);
    const payload = (await response.json()) as {
      estimates?: RevenueEstimate[];
      logoUrls?: Record<string, string>;
      error?: string;
    };
    const templatePayload = (await templateResponse.json()) as {
      template?: TemplateIdentity;
      logoUrl?: string | null;
    };
    const crmPayload = (await crmResponse.json()) as {
      contacts?: CrmContact[];
      error?: string;
    };
    const found = payload.estimates?.find((item) => item.id === estimateId);
    if (!response.ok || !found) {
      setError(payload.error ?? "Valutazione non trovata.");
      return;
    }
    setEstimate(found);
    setTemplateIdentity(templatePayload.template ?? null);
    setTemplateLogoUrl(templatePayload.logoUrl ?? null);
    if (crmResponse.ok) setCrmContacts(crmPayload.contacts ?? []);
    setLogoUrl(
      found.logo_path ? (payload.logoUrls?.[found.logo_path] ?? null) : null,
    );
  }, [estimateId, supabase]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  if (error)
    return (
      <section className="card p-8 text-center text-red-700">{error}</section>
    );
  if (!estimate)
    return (
      <section className="card p-8 text-center text-muted">
        Carico l&apos;anteprima della relazione...
      </section>
    );
  const identity = {
    brandName: estimate.brand_name ?? templateIdentity?.brand_name ?? null,
    headerText: estimate.header_text ?? templateIdentity?.header_text ?? null,
    contactDetails:
      estimate.contact_details ?? templateIdentity?.contact_details ?? null,
    logoUrl: logoUrl ?? templateLogoUrl,
  };
  async function downloadPdf() {
    setDownloading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session
        ?.access_token;
      if (!token) throw new Error("Sessione non disponibile.");
      const response = await fetch(
        `/api/marketing/revenue-estimates/${estimate!.id}/pdf`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(failure?.error ?? "Generazione PDF non riuscita.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `relazione-incassi-${estimate!.owner_name || "immobile"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Non riesco a generare il PDF. Riprova tra poco.",
      );
    } finally {
      setDownloading(false);
    }
  }
  async function attachToCrm(options: {
    contactId?: string;
    createContact?: boolean;
  }) {
    setAttaching(true);
    setActionError("");
    setActionMessage("");
    try {
      const token = (await supabase.auth.getSession()).data.session
        ?.access_token;
      if (!token) throw new Error("Sessione non disponibile.");
      const response = await fetch(
        `/api/marketing/revenue-estimates/${estimate!.id}/crm`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(options),
        },
      );
      const payload = (await response.json()) as {
        contact?: CrmContact;
        replaced?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.contact) {
        throw new Error(
          payload.error ?? "Non riesco ad aggiungere il PDF al CRM.",
        );
      }
      setEstimate((current) =>
        current ? { ...current, crm_contact_id: payload.contact!.id } : current,
      );
      setCrmContacts((current) => [
        payload.contact!,
        ...current.filter((contact) => contact.id !== payload.contact!.id),
      ]);
      setSelectedContactId(payload.contact.id);
      setCrmDialogOpen(false);
      setActionMessage(
        payload.replaced
          ? `Relazione aggiornata nella scheda CRM di ${payload.contact.full_name}.`
          : `Relazione aggiunta alla scheda CRM di ${payload.contact.full_name}.`,
      );
    } catch (attachError) {
      setActionError(
        attachError instanceof Error
          ? attachError.message
          : "Non riesco ad aggiungere il PDF al CRM.",
      );
    } finally {
      setAttaching(false);
    }
  }
  function openCrmAction() {
    setActionError("");
    setActionMessage("");
    const linkedContact = crmContacts.find(
      (contact) => contact.id === estimate!.crm_contact_id,
    );
    if (linkedContact) {
      void attachToCrm({ contactId: linkedContact.id });
      return;
    }
    setSelectedContactId("");
    setCrmDialogOpen(true);
  }
  return (
    <div className="grid gap-5">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          className="btn btn-secondary w-full sm:w-auto"
          href="/app/marketing/rendita-stimata"
        >
          <ArrowLeft size={17} />
          Tutte le stime
        </Link>
        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
          <button
            className="btn btn-secondary w-full"
            disabled={downloading}
            type="button"
            onClick={() => void downloadPdf()}
          >
            <Download size={17} />
            {downloading ? "Genero PDF..." : "Scarica PDF"}
          </button>
          <button
            className="btn btn-primary w-full"
            disabled={attaching}
            type="button"
            onClick={openCrmAction}
          >
            <FolderPlus size={17} />
            {attaching ? "Aggiungo al CRM..." : "Aggiungi al CRM"}
          </button>
        </div>
      </div>
      {actionError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-green">
          {actionMessage}
        </p>
      ) : null}
      <article className="revenue-report-print mx-auto w-full max-w-[210mm] bg-white p-6 text-slate-800 shadow-xl sm:p-10">
        <header className="border-b-4 border-green pb-6 text-center">
          <div className="flex min-h-16 items-center justify-center">
            {identity.logoUrl ? (
              <img
                alt={identity.brandName ?? "Logo"}
                className="max-h-16 max-w-48 object-contain"
                src={identity.logoUrl}
              />
            ) : (
              <p className="text-xl font-bold tracking-wide text-green">
                {identity.brandName || ""}
              </p>
            )}
          </div>
          {identity.brandName && identity.logoUrl ? (
            <p className="mt-2 text-base font-semibold text-ink">
              {identity.brandName}
            </p>
          ) : null}
          {identity.headerText ? (
            <p className="mt-2 text-sm text-slate-500">{identity.headerText}</p>
          ) : null}
        </header>
        <section className="report-block pt-8 text-center">
          <h1 className="text-3xl font-bold text-ink">
            {estimate.report_title}
          </h1>
          <p className="mt-4 text-lg font-semibold">
            {[estimate.property_address, estimate.city]
              .filter(Boolean)
              .join(", ") || "Immobile da definire"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Proprietario: {estimate.owner_name || "Da definire"}
          </p>
        </section>
        <section className="report-block mt-8 border-2 border-slate-800 bg-blue-50 p-6 text-center">
          <p className="text-sm font-bold tracking-wide text-slate-700">
            NETTO MENSILE PROPRIETARIO
          </p>
          <p className="mt-3 text-4xl font-bold text-ink">
            {euro(estimate.owner_monthly_net)}
          </p>
          <p className="mt-3 text-lg font-semibold">
            Netto annuo: {euro(estimate.owner_annual_net)}
          </p>
        </section>
        <section className="report-block mt-8">
          <h2 className="border-b-4 border-green pb-2 text-xl font-bold text-ink">
            Analisi finanziaria
          </h2>
          <div className="mt-4 overflow-hidden border border-slate-300">
            <TableRow
              label="Incasso lordo annuo"
              value={estimate.gross_annual_revenue}
            />
            <TableRow
              label={estimate.ota_cost_label}
              value={estimate.ota_commission_gross}
              negative
            />
            <TableRow
              label={estimate.management_cost_label}
              value={estimate.pm_fee_gross}
              negative
            />
            <TableRow
              label="Incasso proprietario (pre-tax)"
              value={estimate.owner_pre_tax}
            />
            <TableRow
              label={estimate.tax_cost_label}
              value={estimate.tax_amount}
              negative
            />
            <TableRow
              label="NETTO ANNUO"
              value={estimate.owner_annual_net}
              strong
            />
            <TableRow
              label="NETTO MENSILE"
              value={estimate.owner_monthly_net}
              strong
            />
          </div>
        </section>
        <section className="report-block mt-8">
          <h2 className="border-b-4 border-green pb-2 text-xl font-bold text-ink">
            Metriche chiave
          </h2>
          <div className="mt-4 grid grid-cols-3 border border-slate-300 text-center">
            <Metric
              label="Incasso lordo annuo"
              value={euro(estimate.gross_annual_revenue)}
            />
            <Metric
              label="ADR"
              value={
                estimate.adr_per_night ? euro(estimate.adr_per_night) : "n/d"
              }
            />
            <Metric
              label="Occupazione"
              value={
                estimate.occupancy_rate === null
                  ? "n/d"
                  : percent(estimate.occupancy_rate)
              }
            />
          </div>
        </section>
        <section className="report-block mt-8 rounded-md bg-amber-50 p-4 text-xs leading-5 text-slate-700">
          <p>
            <strong>Parametri:</strong> Mix Airbnb{" "}
            {percent(estimate.airbnb_mix_rate)} · Booking{" "}
            {percent(estimate.booking_mix_rate)} · Diretto{" "}
            {percent(estimate.direct_mix_rate)} · Fee PM{" "}
            {percent(estimate.pm_fee_rate)} · Aliquota fiscale{" "}
            {percent(estimate.tax_rate)}
          </p>
          <p className="mt-4">{estimate.disclaimer}</p>
        </section>
        <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          {identity.contactDetails || identity.brandName || ""}
        </footer>
      </article>
      {crmDialogOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/45 p-3 sm:p-6">
          <div className="mx-auto mt-8 w-full max-w-xl rounded-xl bg-white p-5 shadow-2xl sm:mt-20 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker">Collegamento CRM</p>
                <h2 className="mt-2 text-xl font-semibold text-ink">
                  Aggiungi la relazione alla pipeline
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Scegli una scheda esistente oppure creane una nuova con i dati
                  presenti nella valutazione.
                </p>
              </div>
              <button
                aria-label="Chiudi"
                className="icon-button shrink-0"
                disabled={attaching}
                type="button"
                onClick={() => setCrmDialogOpen(false)}
              >
                <X size={19} />
              </button>
            </div>
            <label className="mt-6 grid gap-2 text-sm font-semibold text-ink">
              <span>Scheda CRM esistente</span>
              <select
                className="form-input"
                value={selectedContactId}
                onChange={(event) => setSelectedContactId(event.target.value)}
              >
                <option value="">Seleziona un proprietario</option>
                {crmContacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.full_name}
                    {contact.city ? ` - ${contact.city}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn btn-primary mt-4 w-full"
              disabled={!selectedContactId || attaching}
              type="button"
              onClick={() => void attachToCrm({ contactId: selectedContactId })}
            >
              <FolderPlus size={17} />
              {attaching ? "Aggiungo..." : "Collega e aggiungi PDF"}
            </button>
            <div className="my-6 flex items-center gap-3 text-xs font-bold uppercase text-muted">
              <span className="h-px flex-1 bg-slate-200" />
              oppure
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-ink">
                Crea una nuova scheda CRM
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Verranno importati proprietario, tipologia, città e indirizzo
                disponibili nella valutazione. Potrai completare gli altri dati
                dalla pipeline.
              </p>
              <button
                className="btn btn-secondary mt-4 w-full"
                disabled={attaching}
                type="button"
                onClick={() => void attachToCrm({ createContact: true })}
              >
                <Plus size={17} />
                {attaching ? "Creo la scheda..." : "Crea scheda e aggiungi PDF"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TableRow({
  label,
  value,
  negative,
  strong,
}: {
  label: string;
  value: number;
  negative?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto] gap-6 border-b border-slate-200 px-4 py-3 last:border-0 ${strong ? "bg-green font-bold text-white" : ""}`}
    >
      <span>{label}</span>
      <span
        className={
          negative && !strong ? "font-semibold text-red-600" : "font-semibold"
        }
      >
        {negative ? "- " : ""}
        {euro(value)}
      </span>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-slate-300 p-3 last:border-r-0">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-ink">{value}</p>
    </div>
  );
}
function euro(value: number) {
  const sign = value < 0 ? "-" : "";
  const [integer, decimal] = Math.abs(value).toFixed(2).split(".");
  return `${sign}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimal} €`;
}
function percent(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value);
}
