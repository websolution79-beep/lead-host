import "server-only";
import { getEnv } from "@/lib/env";

export const BREVO_ATTRIBUTE_NAMES = {
  firstName: "NOME",
  lastName: "COGNOME",
  registeredAt: "DATA_ISCRIZIONE",
  lastAccessAt: "ULTIMO_ACCESSO",
  accountStatus: "STATO_ACCOUNT",
  marketingConsent: "CONSENSO_MARKETING",
  marketingConsentStatus: "STATO_CONSENSO_MARKETING",
  walletBalance: "SALDO_WALLET",
  hasWalletTopup: "HA_RICARICATO_WALLET",
  firstWalletTopupAt: "DATA_PRIMA_RICARICA",
  lastWalletTopupAt: "DATA_ULTIMA_RICARICA",
  walletTopupsCount: "NUMERO_RICARICHE",
  walletTopupsTotal: "TOTALE_RICARICATO",
  leadPurchasesCount: "NUMERO_LEAD_ACQUISTATI",
  firstLeadPurchaseAt: "DATA_PRIMO_LEAD_ACQUISTATO",
  lastLeadPurchaseAt: "DATA_ULTIMO_LEAD_ACQUISTATO",
  leadSpendGross: "SPESA_LEAD_LORDA",
  walletRefundsTotal: "TOTALE_RIACCREDITI_WALLET",
  leadSpendNet: "SPESA_LEAD_NETTA",
  lifecycleStatus: "STATO_PM",
} as const;

export const MARKETING_CONSENT_POLICY_VERSION = "1.0";
export const BREVO_MAX_ATTEMPTS = 8;

export type BrevoConfig =
  | {
      enabled: false;
      reason: "disabled" | "missing_configuration";
    }
  | {
      enabled: true;
      apiKey: string;
      listId: number;
    };

export function getBrevoConfig(): BrevoConfig {
  if (getEnv("BREVO_ENABLED")?.trim().toLowerCase() !== "true") {
    return { enabled: false, reason: "disabled" };
  }

  const apiKey = getEnv("BREVO_API_KEY")?.trim();
  const listId = Number.parseInt(getEnv("BREVO_LIST_ID") ?? "", 10);

  if (!apiKey || !Number.isInteger(listId) || listId <= 0) {
    return { enabled: false, reason: "missing_configuration" };
  }

  return {
    enabled: true,
    apiKey,
    listId,
  };
}

export function getBrevoWebhookSecret() {
  return getEnv("BREVO_WEBHOOK_SECRET")?.trim() || null;
}
