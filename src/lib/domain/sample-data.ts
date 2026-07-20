import type { LeadInternalStatus, LeadPublicStatus } from "./lead-state";

export type MarketplaceLead = {
  id: string;
  title: string;
  region: string;
  province: string;
  city: string;
  district: string;
  address: string;
  ownerName: string;
  propertyType: string;
  bedrooms: number;
  bathrooms: number;
  beds: number;
  areaSqm: number;
  timing: string;
  services: string[];
  publicStatus: LeadPublicStatus;
  internalStatus: LeadInternalStatus;
  sharedSlotsSold: number;
  exclusivePurchaseId: string | null;
  publishedAt: string;
  expiresAt: string;
  ownerDescription: string;
};

export const demoLeads: MarketplaceLead[] = [
  {
    id: "palermo-centro-trilocale",
    title: "Trilocale a Palermo",
    region: "Sicilia",
    province: "Palermo",
    city: "Palermo",
    district: "Centro",
    address: "Via Maqueda 31, Palermo",
    ownerName: "Giulia Ferrara",
    propertyType: "Appartamento",
    bedrooms: 2,
    bathrooms: 1,
    beds: 4,
    areaSqm: 85,
    timing: "Entro 30 giorni",
    services: ["Gestione completa", "Pulizie", "Check-in"],
    publicStatus: "available",
    internalStatus: "available",
    sharedSlotsSold: 0,
    exclusivePurchaseId: null,
    publishedAt: "2026-07-20",
    expiresAt: "2026-07-27",
    ownerDescription:
      "Appartamento ristrutturato in centro, gia arredato e vicino alle principali attrazioni. Vorrei capire se conviene avviare affitti brevi con gestione completa, incluse pulizie e check-in.",
  },
  {
    id: "roma-prati-bilocale",
    title: "Bilocale a Roma",
    region: "Lazio",
    province: "Roma",
    city: "Roma",
    district: "Prati",
    address: "Via Cola di Rienzo 122, Roma",
    ownerName: "Marco De Santis",
    propertyType: "Appartamento",
    bedrooms: 1,
    bathrooms: 1,
    beds: 2,
    areaSqm: 62,
    timing: "Il prima possibile",
    services: ["Gestione online", "Revenue management"],
    publicStatus: "last_availability",
    internalStatus: "one_slot_sold",
    sharedSlotsSold: 1,
    exclusivePurchaseId: null,
    publishedAt: "2026-07-19",
    expiresAt: "2026-07-26",
    ownerDescription:
      "Bilocale gia pubblicato su Airbnb, ma gestito in autonomia con risultati discontinui. Cerco supporto per ottimizzare prezzi, calendario e comunicazione con ospiti.",
  },
  {
    id: "bari-murat-bb",
    title: "B&B a Bari",
    region: "Puglia",
    province: "Bari",
    city: "Bari",
    district: "Murat",
    address: "Via Sparano 48, Bari",
    ownerName: "Antonio Leone",
    propertyType: "Struttura ricettiva",
    bedrooms: 4,
    bathrooms: 4,
    beds: 8,
    areaSqm: 140,
    timing: "Entro 3 mesi",
    services: ["Gestione annunci", "Comunicazione ospiti"],
    publicStatus: "unavailable",
    internalStatus: "sold_exclusive",
    sharedSlotsSold: 0,
    exclusivePurchaseId: "demo-exclusive-purchase",
    publishedAt: "2026-07-13",
    expiresAt: "2026-07-20",
    ownerDescription:
      "Piccola struttura ricettiva in zona centrale. Il proprietario valuta un partner per la gestione commerciale e operativa, con attenzione alla qualita dell'accoglienza.",
  },
  {
    id: "milano-navigli-monolocale",
    title: "Monolocale sui Navigli",
    region: "Lombardia",
    province: "Milano",
    city: "Milano",
    district: "Navigli",
    address: "Ripa di Porta Ticinese 43, Milano",
    ownerName: "Laura Riva",
    propertyType: "Appartamento",
    bedrooms: 1,
    bathrooms: 1,
    beds: 2,
    areaSqm: 38,
    timing: "Sto solo valutando",
    services: ["Gestione online", "Revenue management", "Gestione annunci"],
    publicStatus: "available",
    internalStatus: "available",
    sharedSlotsSold: 0,
    exclusivePurchaseId: null,
    publishedAt: "2026-07-20",
    expiresAt: "2026-07-27",
    ownerDescription:
      "Monolocale arredato in zona richiesta, mai usato per affitti brevi. Il proprietario vuole una stima realistica e un modello di gestione poco invasivo.",
  },
  {
    id: "firenze-oltrarno-casa",
    title: "Casa indipendente a Firenze",
    region: "Toscana",
    province: "Firenze",
    city: "Firenze",
    district: "Oltrarno",
    address: "Via dei Serragli 18, Firenze",
    ownerName: "Francesca Conti",
    propertyType: "Casa indipendente",
    bedrooms: 3,
    bathrooms: 2,
    beds: 6,
    areaSqm: 115,
    timing: "Entro 3 mesi",
    services: ["Gestione completa", "Manutenzione", "Biancheria"],
    publicStatus: "available",
    internalStatus: "available",
    sharedSlotsSold: 0,
    exclusivePurchaseId: null,
    publishedAt: "2026-07-18",
    expiresAt: "2026-07-25",
    ownerDescription:
      "Casa su due livelli con buon potenziale turistico. Servono gestione ospiti, manutenzione ordinaria e coordinamento biancheria.",
  },
  {
    id: "napoli-chiaia-villa",
    title: "Villa a Napoli",
    region: "Campania",
    province: "Napoli",
    city: "Napoli",
    district: "Chiaia",
    address: "Via Chiaia 91, Napoli",
    ownerName: "Roberto Esposito",
    propertyType: "Villa",
    bedrooms: 4,
    bathrooms: 3,
    beds: 8,
    areaSqm: 180,
    timing: "Piu avanti",
    services: ["Gestione completa", "Pulizie", "Manutenzione"],
    publicStatus: "unavailable",
    internalStatus: "sold_two_pm",
    sharedSlotsSold: 2,
    exclusivePurchaseId: null,
    publishedAt: "2026-07-16",
    expiresAt: "2026-07-23",
    ownerDescription:
      "Villa ampia, attualmente usata dalla famiglia solo in alcuni periodi. Richiesta ad alto valore ma non piu acquistabile nel marketplace.",
  },
];
