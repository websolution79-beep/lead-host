"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import type { RevenueEstimate } from "@/components/marketing-revenue-estimates";

type TemplateIdentity = {
  brand_name: string | null;
  header_text: string | null;
  contact_details: string | null;
  logo_path: string | null;
};

export function MarketingRevenueReport({ estimateId }: { estimateId: string }) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [estimate, setEstimate] = useState<RevenueEstimate | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [templateIdentity, setTemplateIdentity] =
    useState<TemplateIdentity | null>(null);
  const [templateLogoUrl, setTemplateLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) {
      setError("Sessione non disponibile.");
      return;
    }
    const [response, templateResponse] = await Promise.all([
      fetch("/api/marketing/revenue-estimates", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
      fetch("/api/marketing/revenue-template", {
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
    const found = payload.estimates?.find((item) => item.id === estimateId);
    if (!response.ok || !found) {
      setError(payload.error ?? "Valutazione non trovata.");
      return;
    }
    setEstimate(found);
    setTemplateIdentity(templatePayload.template ?? null);
    setTemplateLogoUrl(templatePayload.logoUrl ?? null);
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
        <button
          className="btn btn-primary w-full sm:w-auto"
          type="button"
          onClick={() => window.print()}
        >
          <Printer size={17} />
          Stampa anteprima
        </button>
      </div>
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
          {identity.contactDetails ? (
            <p className="mt-2 whitespace-pre-line text-xs leading-5 text-slate-500">
              {identity.contactDetails}
            </p>
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
      <style jsx global>{`
        @page {
          size: A4;
          margin: 12mm;
        }
        @media print {
          body {
            background: white !important;
          }
          .no-print,
          .premium-header,
          aside,
          nav {
            display: none !important;
          }
          .revenue-report-print {
            box-shadow: none !important;
            max-width: none !important;
            width: 100% !important;
            padding: 0 !important;
          }
          .report-block {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
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
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}
function percent(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value);
}
