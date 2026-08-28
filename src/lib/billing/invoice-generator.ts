import { create } from "xmlbuilder2";
import {
  isValidEmail,
  isValidItalianFiscalCode,
  isValidItalianPostalCode,
  isValidItalianVatNumber,
  isValidProvinceCode,
  isValidSdiCode,
  normalizeFiscalCode,
  normalizeItalianVatNumber,
} from "@/lib/billing/fiscal-validation";
import type {
  BillingCustomerSnapshot,
  FatturaPaGenerationInput,
  FatturaPaGenerationResult,
} from "@/lib/billing/invoice-types";

const INVOICE_NAMESPACE =
  "http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2";

export function generateFatturaPaXml(
  input: FatturaPaGenerationInput,
): FatturaPaGenerationResult {
  validateGenerationInput(input);

  const { issuer, customer, source } = input;
  const documentDate =
    input.documentDate ?? formatItalianDate(source.completedAt);
  const provisionalNumber =
    input.provisionalNumber ??
    `${issuer.provisionalNumberPrefix}-${input.transmissionProgressive}`;
  const stampDutyApplied =
    source.amountCents > issuer.stampDutyThresholdCents &&
    issuer.stampDutyAmountCents > 0;
  const amount = formatCents(source.amountCents);
  const vatRate = issuer.vatRate.toFixed(2);
  const recipientCode =
    customer.subjectType === "company" && customer.sdiCode
      ? customer.sdiCode.toUpperCase()
      : "0000000";
  const recipientPec =
    recipientCode === "0000000" && customer.subjectType === "company"
      ? customer.pec
      : null;
  const paymentReference =
    source.stripePaymentIntentId ?? source.stripeCheckoutSessionId;
  const lineItems = normalizeLineItems(source, issuer.lineDescription);

  const invoice = {
    "p:FatturaElettronica": {
      "@versione": issuer.transmissionFormat,
      "@xmlns:ds": "http://www.w3.org/2000/09/xmldsig#",
      "@xmlns:p": INVOICE_NAMESPACE,
      "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      FatturaElettronicaHeader: {
        DatiTrasmissione: {
          IdTrasmittente: {
            IdPaese: "IT",
            IdCodice: issuer.arubaTransmitterTaxCode,
          },
          ProgressivoInvio: input.transmissionProgressive,
          FormatoTrasmissione: issuer.transmissionFormat,
          CodiceDestinatario: recipientCode,
          ...(recipientPec ? { PECDestinatario: recipientPec } : {}),
        },
        CedentePrestatore: {
          DatiAnagrafici: {
            IdFiscaleIVA: {
              IdPaese: issuer.vatCountryCode,
              IdCodice: normalizeItalianVatNumber(issuer.vatNumber),
            },
            CodiceFiscale: normalizeFiscalCode(issuer.fiscalCode),
            Anagrafica: {
              Denominazione: issuer.legalName,
            },
            RegimeFiscale: issuer.taxRegime,
          },
          Sede: {
            Indirizzo: issuer.addressLine,
            CAP: issuer.postalCode,
            Comune: issuer.city,
            Provincia: issuer.province,
            Nazione: issuer.country,
          },
          Contatti: {
            Email: issuer.email,
          },
        },
        CessionarioCommittente: {
          DatiAnagrafici: buildCustomerAnagraphicData(customer),
          Sede: {
            Indirizzo: customer.addressLine,
            CAP: customer.postalCode,
            Comune: customer.city,
            Provincia: customer.province,
            Nazione: customer.country,
          },
        },
      },
      FatturaElettronicaBody: {
        DatiGenerali: {
          DatiGeneraliDocumento: {
            TipoDocumento: issuer.documentType,
            Divisa: issuer.currency,
            Data: documentDate,
            Numero: provisionalNumber,
            ...(stampDutyApplied
              ? {
                  DatiBollo: {
                    BolloVirtuale: "SI",
                    ImportoBollo: formatCents(
                      issuer.stampDutyAmountCents,
                    ),
                  },
                }
              : {}),
            ImportoTotaleDocumento: amount,
            Causale: source.description?.trim() || issuer.lineDescription,
          },
        },
        DatiBeniServizi: {
          DettaglioLinee: lineItems.map((line, index) => ({
            NumeroLinea: String(index + 1),
            Descrizione: line.description,
            Quantita: "1.00",
            PrezzoUnitario: formatCents(line.amountCents),
            PrezzoTotale: formatCents(line.amountCents),
            AliquotaIVA: vatRate,
            Natura: issuer.vatNature,
            ...(index === 0 && paymentReference
              ? {
                  AltriDatiGestionali: {
                    TipoDato: "STRIPE",
                    RiferimentoTesto: paymentReference.slice(0, 60),
                  },
                }
              : {}),
          })),
          DatiRiepilogo: {
            AliquotaIVA: vatRate,
            Natura: issuer.vatNature,
            ImponibileImporto: amount,
            Imposta: "0.00",
            RiferimentoNormativo: issuer.vatReference,
          },
        },
        DatiPagamento: {
          CondizioniPagamento: "TP02",
          DettaglioPagamento: {
            ModalitaPagamento: issuer.paymentMethod,
            DataScadenzaPagamento: documentDate,
            ImportoPagamento: amount,
            ...(paymentReference
              ? { CodicePagamento: paymentReference.slice(0, 60) }
              : {}),
          },
        },
      },
    },
  };
  const xml = create({ version: "1.0", encoding: "UTF-8" })
    .ele(invoice)
    .end({ prettyPrint: true });

  return {
    xml,
    provisionalNumber,
    documentDate,
    stampDutyApplied,
    stampDutyAmountCents: stampDutyApplied
      ? issuer.stampDutyAmountCents
      : 0,
  };
}

function buildCustomerAnagraphicData(customer: BillingCustomerSnapshot) {
  if (customer.subjectType === "company") {
    return {
      IdFiscaleIVA: {
        IdPaese: "IT",
        IdCodice: normalizeItalianVatNumber(customer.vatNumber),
      },
      ...(customer.companyFiscalCode
        ? {
            CodiceFiscale: normalizeFiscalCode(
              customer.companyFiscalCode,
            ),
          }
        : {}),
      Anagrafica: {
        Denominazione: customer.companyName,
      },
    };
  }

  return {
    CodiceFiscale: normalizeFiscalCode(customer.fiscalCode),
    Anagrafica: {
      Nome: customer.firstName,
      Cognome: customer.lastName,
    },
  };
}

function validateGenerationInput(input: FatturaPaGenerationInput) {
  const { issuer, customer, source, transmissionProgressive } = input;

  if (!Number.isInteger(source.amountCents) || source.amountCents <= 0) {
    throw new Error("Importo fattura non valido.");
  }
  if (!/^[A-Za-z0-9]{1,10}$/.test(transmissionProgressive)) {
    throw new Error("Progressivo trasmissione non valido.");
  }
  if (!issuer.legalName.trim() || issuer.legalName.length > 80) {
    throw new Error("Denominazione SOGI non valida.");
  }
  if (!isValidItalianVatNumber(issuer.vatNumber)) {
    throw new Error("Partita IVA SOGI non valida.");
  }
  if (!isValidItalianFiscalCode(issuer.fiscalCode)) {
    throw new Error("Codice fiscale SOGI non valido.");
  }
  if (
    !isValidItalianPostalCode(issuer.postalCode) ||
    !isValidProvinceCode(issuer.province)
  ) {
    throw new Error("Sede fiscale SOGI non valida.");
  }
  if (!isValidEmail(issuer.email)) {
    throw new Error("Email SOGI non valida.");
  }
  if (!/^\d{11}$/.test(issuer.arubaTransmitterTaxCode)) {
    throw new Error("ID trasmittente Aruba non valido.");
  }
  if (issuer.transmissionFormat !== "FPR12") {
    throw new Error("Formato trasmissione non supportato.");
  }
  if (issuer.vatReference.length > 100) {
    throw new Error("Riferimento normativo IVA troppo lungo.");
  }
  if (!issuer.stampDutyAbsorbed) {
    throw new Error("Il bollo deve essere assorbito da SOGI.");
  }

  validateCustomer(customer);
  normalizeLineItems(source, issuer.lineDescription);
}

function normalizeLineItems(
  source: FatturaPaGenerationInput["source"],
  fallbackDescription: string,
) {
  const lines = source.lineItems?.length
    ? source.lineItems
    : [
        {
          code: "wallet_top_up",
          description: fallbackDescription,
          amountCents: source.amountCents,
        },
      ];

  if (lines.length > 20) {
    throw new Error("La fattura contiene troppe righe.");
  }

  let totalCents = 0;
  for (const line of lines) {
    if (
      !line.code.trim() ||
      !line.description.trim() ||
      line.description.trim().length > 1000 ||
      !Number.isInteger(line.amountCents) ||
      line.amountCents <= 0
    ) {
      throw new Error("Riga fattura non valida.");
    }
    totalCents += line.amountCents;
  }

  if (totalCents !== source.amountCents) {
    throw new Error("Il totale delle righe non coincide con il totale fattura.");
  }

  return lines.map((line) => ({
    ...line,
    code: line.code.trim(),
    description: line.description.trim(),
  }));
}

function validateCustomer(customer: BillingCustomerSnapshot) {
  if (
    !customer.addressLine.trim() ||
    !customer.city.trim() ||
    customer.country !== "IT" ||
    !isValidItalianPostalCode(customer.postalCode) ||
    !isValidProvinceCode(customer.province)
  ) {
    throw new Error("Indirizzo di fatturazione cliente non valido.");
  }
  if (!isValidEmail(customer.invoiceEmail)) {
    throw new Error("Email fatture cliente non valida.");
  }

  if (customer.subjectType === "individual") {
    if (
      !customer.firstName?.trim() ||
      !customer.lastName?.trim() ||
      !isValidItalianFiscalCode(customer.fiscalCode)
    ) {
      throw new Error("Dati fiscali della persona fisica non validi.");
    }

    return;
  }

  if (
    !customer.companyName?.trim() ||
    !isValidItalianVatNumber(customer.vatNumber)
  ) {
    throw new Error("Dati fiscali della societa non validi.");
  }
  if (
    customer.companyFiscalCode &&
    !isValidItalianFiscalCode(customer.companyFiscalCode)
  ) {
    throw new Error("Codice fiscale societario non valido.");
  }
  if (customer.sdiCode && !isValidSdiCode(customer.sdiCode)) {
    throw new Error("Codice SDI non valido.");
  }
  if (customer.pec && !isValidEmail(customer.pec)) {
    throw new Error("PEC non valida.");
  }
  if (!customer.sdiCode && !customer.pec) {
    throw new Error("Codice SDI o PEC obbligatorio per la societa.");
  }
}

function formatCents(value: number) {
  return (value / 100).toFixed(2);
}

function formatItalianDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Data pagamento non valida.");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Data pagamento non valida.");
  }

  return `${year}-${month}-${day}`;
}
