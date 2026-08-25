export type MarketplaceFinancialTemplate = {
  key: "default";
  report_title: string;
  brand_name: string;
  header_text: string | null;
  contact_details: string | null;
  logo_path: string | null;
  days_available: number;
  pm_fee_rate: number;
  airbnb_mix_rate: number;
  booking_mix_rate: number;
  direct_mix_rate: number;
  airbnb_commission_rate: number;
  booking_commission_rate: number;
  direct_commission_rate: number;
  ota_vat_rate: number;
  pm_vat_rate: number;
  tax_rate: number;
  ota_cost_label: string;
  management_cost_label: string;
  tax_cost_label: string;
  disclaimer: string;
  created_at: string;
  updated_at: string;
};

export type MarketplaceFinancialTemplatePayload = {
  reportTitle: string;
  brandName: string;
  headerText: string | null;
  contactDetails: string | null;
  logoPath: string | null;
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
  otaCostLabel: string;
  managementCostLabel: string;
  taxCostLabel: string;
  disclaimer: string;
};

export const MARKETPLACE_FINANCIAL_TEMPLATE_DEFAULTS: MarketplaceFinancialTemplatePayload = {
  reportTitle: "Stima di rendita potenziale",
  brandName: "Lead Host",
  headerText: null,
  contactDetails: null,
  logoPath: null,
  daysAvailable: 365,
  pmFeeRate: 0.2,
  airbnbMixRate: 0.7,
  bookingMixRate: 0.3,
  directMixRate: 0,
  airbnbCommissionRate: 0.15,
  bookingCommissionRate: 0.18,
  directCommissionRate: 0,
  otaVatRate: 0.22,
  pmVatRate: 0,
  taxRate: 0,
  otaCostLabel: "Commissioni OTA incl. IVA",
  managementCostLabel: "Gestione Property Manager incl. IVA",
  taxCostLabel: "Imposte",
  disclaimer:
    "Questa stima ha finalita esclusivamente informative e si basa sui parametri inseriti e sui dati di mercato disponibili. I risultati effettivi possono variare in funzione di stagionalita, domanda, costi operativi e dinamiche competitive. Le valutazioni fiscali sono indicative e devono essere verificate con il proprio consulente.",
};
