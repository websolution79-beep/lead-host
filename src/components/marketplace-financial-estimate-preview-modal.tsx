"use client";

import { Eye, X } from "lucide-react";
import {
  calculateRevenueEstimate,
  getMarketplaceFinancialSummary,
} from "@/lib/financial/revenue-calculation";

export type MarketplaceFinancialEstimatePreviewData = {
  reportTitle: string;
  brandName: string;
  headerText: string | null;
  contactDetails: string | null;
  logoUrl: string | null;
  disclaimer: string;
  otaCostLabel: string;
  managementCostLabel: string;
  taxCostLabel: string;
  adrPerNight: number;
  occupancyRate: number;
  daysAvailable: number;
  pmFeeRate: number;
  airbnbMixRate: number;
  bookingMixRate: number;
  directMixRate: number;
  airbnbCommissionRate: number;
  bookingCommissionRate: number;
  directCommissionRate: number;
  otaVatRate: number;
  pmVatRate: number;
  taxRate: number;
};

export function MarketplaceFinancialEstimatePreviewModal({
  data,
  leadTitle,
  location,
  onClose,
}: {
  data: MarketplaceFinancialEstimatePreviewData;
  leadTitle: string;
  location: string | null;
  onClose: () => void;
}) {
  const result = calculateRevenueEstimate({
    calculationMode: "adr_occupancy",
    adrPerNight: data.adrPerNight,
    occupancyRate: data.occupancyRate,
    daysAvailable: data.daysAvailable,
    pmFeeRate: data.pmFeeRate,
    airbnbMixRate: data.airbnbMixRate,
    bookingMixRate: data.bookingMixRate,
    directMixRate: data.directMixRate,
    airbnbCommissionRate: data.airbnbCommissionRate,
    bookingCommissionRate: data.bookingCommissionRate,
    directCommissionRate: data.directCommissionRate,
    otaVatRate: data.otaVatRate,
    pmVatRate: data.pmVatRate,
    taxRate: data.taxRate,
  });
  const marketplaceSummary = getMarketplaceFinancialSummary(result);
  const disclaimer = data.disclaimer
    .replace(
      /\s*Le valutazioni fiscali sono indicative e devono essere verificate con il proprio consulente\.?/i,
      "",
    )
    .trim();

  return (
    <div
      className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950/60 p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="marketplace-estimate-preview-title"
    >
      <div className="min-h-full bg-slate-100 sm:mx-auto sm:min-h-0 sm:max-w-4xl sm:rounded-lg sm:shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-lg bg-mint p-2 text-green"><Eye size={19} /></span>
            <div className="min-w-0">
              <p className="section-kicker">Solo anteprima</p>
              <h2 className="truncate text-lg font-semibold text-ink" id="marketplace-estimate-preview-title">Stima finanziaria Marketplace</h2>
            </div>
          </div>
          <button className="icon-button shrink-0" type="button" title="Chiudi anteprima" onClick={onClose}><X size={19} /></button>
        </header>

        <main className="mx-auto max-w-3xl p-4 sm:p-8">
          <article className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
            <div className="border-b-4 border-green px-6 py-7 text-center sm:px-10 sm:py-10">
              {data.logoUrl ? (
                <img alt={data.brandName} className="mx-auto mb-5 max-h-16 max-w-52 object-contain" src={data.logoUrl} />
              ) : (
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-green">{data.brandName}</p>
              )}
              {data.headerText ? <p className="mb-3 text-sm text-muted">{data.headerText}</p> : null}
              <h3 className="text-2xl font-bold text-ink sm:text-3xl">{data.reportTitle}</h3>
              <p className="mt-3 text-lg font-semibold text-ink">{leadTitle}</p>
              {location ? <p className="mt-1 text-sm text-muted">{location}</p> : null}
            </div>

            <section className="mx-4 mt-6 border border-slate-300 bg-blue-50 px-5 py-6 text-center sm:mx-10 sm:mt-9 sm:px-8 sm:py-9">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-950">Netto mensile immobile</p>
              <p className="mt-3 text-4xl font-bold text-ink sm:text-5xl">{formatCurrency(marketplaceSummary.monthlyNet)}</p>
              <p className="mt-3 text-lg font-semibold text-ink">Netto annuo immobile: {formatCurrency(marketplaceSummary.annualNet)}</p>
            </section>

            <section className="px-4 pb-4 pt-9 sm:px-10 sm:pb-8 sm:pt-12">
              <h4 className="border-b-4 border-green pb-3 text-xl font-bold text-ink">Analisi finanziaria</h4>
              <dl className="mt-5 overflow-hidden border border-slate-200">
                <FinancialRow label="Incasso lordo annuo" value={formatCurrency(result.gross_annual_revenue)} />
                <FinancialRow label="Commissioni OTA" value={`- ${formatCurrency(result.ota_commission_gross)}`} negative />
              </dl>
            </section>

            <section className="px-4 pb-4 sm:px-10 sm:pb-8">
              <h4 className="text-xl font-bold text-ink">Metriche chiave</h4>
              <div className="mt-4 grid grid-cols-3 overflow-hidden border border-slate-300">
                <Metric label="Incasso lordo annuo" value={formatCurrency(result.gross_annual_revenue)} />
                <Metric label="ADR" value={formatCurrency(data.adrPerNight)} />
                <Metric label="Occupazione" value={formatPercent(data.occupancyRate)} />
              </div>
            </section>

            <section className="mx-4 mb-4 rounded-lg bg-amber-50 p-5 text-sm leading-6 text-ink sm:mx-10 sm:mb-8 sm:p-6">
              <p><strong>Parametri:</strong> Mix Airbnb {formatPercent(data.airbnbMixRate)} · Booking {formatPercent(data.bookingMixRate)} · Diretto {formatPercent(data.directMixRate)}</p>
              {disclaimer ? <p className="mt-4">{disclaimer}</p> : null}
            </section>

            {data.contactDetails ? <footer className="border-t border-slate-200 px-6 py-6 text-center text-sm text-muted sm:px-10">{data.contactDetails}</footer> : null}
          </article>
        </main>
      </div>
    </div>
  );
}

function FinancialRow({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) {
  return <div className="flex items-center justify-between gap-5 border-b border-slate-200 px-5 py-4 last:border-b-0"><dt className="text-ink">{label}</dt><dd className={negative ? "shrink-0 font-bold text-red-600" : "shrink-0 font-bold text-ink"}>{value}</dd></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 border-r border-slate-300 bg-blue-50 p-3 text-center last:border-r-0 sm:p-4"><p className="text-[10px] font-bold uppercase leading-4 text-muted sm:text-xs">{label}</p><p className="mt-2 break-words text-sm font-bold text-ink sm:text-lg">{value}</p></div>;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    useGrouping: true,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 }).format(value);
}
