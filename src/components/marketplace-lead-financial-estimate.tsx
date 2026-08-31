"use client";

import { BarChart3, Eye } from "lucide-react";
import { useState } from "react";
import {
  MarketplaceFinancialEstimatePreviewModal,
  type MarketplaceFinancialEstimatePreviewData,
} from "@/components/marketplace-financial-estimate-preview-modal";
import type { MarketplaceLead } from "@/lib/domain/sample-data";
import { getMarketplaceFinancialSummary } from "@/lib/financial/revenue-calculation";

export function MarketplaceLeadFinancialEstimate({
  estimate,
  leadTitle,
  location,
  modalZIndexClass,
}: {
  estimate: NonNullable<MarketplaceLead["financialEstimate"]>;
  leadTitle: string;
  location: string | null;
  modalZIndexClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const summary = getMarketplaceFinancialSummary({
    effective_ota_rate: 0,
    gross_annual_revenue: estimate.grossAnnualRevenue,
    ota_commission_net: 0,
    ota_commission_gross: estimate.otaCommissionGross,
    pm_fee_base: estimate.grossAnnualRevenue - estimate.otaCommissionGross,
    pm_fee_net: 0,
    pm_fee_gross: 0,
    owner_pre_tax: 0,
    tax_amount: 0,
    owner_annual_net: 0,
    owner_monthly_net: 0,
  });

  return (
    <section className="border-b border-ink/10 pb-6">
      <p className="section-kicker">Stima finanziaria</p>
      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-blue-900">
          <BarChart3 size={16} aria-hidden="true" /> Incasso lordo annuo stimato
        </p>
        <p className="mt-2 text-3xl font-bold text-blue-950">
          {formatCurrency(estimate.grossAnnualRevenue)}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Metric label="ADR" value={formatCurrency(estimate.adrPerNight)} />
          <Metric label="Occupazione" value={formatPercent(estimate.occupancyRate)} />
          <Metric label="Commissioni OTA" value={`- ${formatCurrency(estimate.otaCommissionGross)}`} />
          <Metric label="Netto mensile" value={formatCurrency(summary.monthlyNet)} />
        </div>
      </div>
      <button className="btn btn-secondary mt-4 w-full" type="button" onClick={() => setOpen(true)}>
        <Eye size={17} /> Vedi stima dettagliata
      </button>
      {open ? (
        <MarketplaceFinancialEstimatePreviewModal
          data={toPreviewData(estimate)}
          leadTitle={leadTitle}
          location={location}
          onClose={() => setOpen(false)}
          viewer="pm"
          overlayClassName={modalZIndexClass}
        />
      ) : null}
    </section>
  );
}

function toPreviewData(
  estimate: NonNullable<MarketplaceLead["financialEstimate"]>,
): MarketplaceFinancialEstimatePreviewData {
  return {
    reportTitle: estimate.reportTitle,
    brandName: estimate.brandName,
    headerText: estimate.headerText,
    contactDetails: estimate.contactDetails,
    logoUrl: estimate.logoUrl,
    disclaimer: estimate.disclaimer,
    otaCostLabel: "Commissioni OTA",
    managementCostLabel: "",
    taxCostLabel: "",
    adrPerNight: estimate.adrPerNight,
    occupancyRate: estimate.occupancyRate,
    daysAvailable: estimate.daysAvailable,
    pmFeeRate: estimate.pmFeeRate,
    airbnbMixRate: estimate.airbnbMixRate,
    bookingMixRate: estimate.bookingMixRate,
    directMixRate: estimate.directMixRate,
    airbnbCommissionRate: estimate.airbnbCommissionRate,
    bookingCommissionRate: estimate.bookingCommissionRate,
    directCommissionRate: estimate.directCommissionRate,
    otaVatRate: estimate.otaVatRate,
    pmVatRate: estimate.pmVatRate,
    taxRate: estimate.taxRate,
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-800">{label}</p><p className="mt-1 truncate font-semibold text-ink">{value}</p></div>;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: true, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 }).format(value);
}
