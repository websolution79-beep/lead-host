import { z } from "zod";
import { normalizeSystemePageUrl } from "./payload";

export const systemeSettingsSchema = z.object({
  enabled: z.boolean(),
  importMode: z.enum(["all", "selected_pages"]),
  allowedPageUrls: z.array(z.string().trim().max(8192)).max(50),
  destinationStageId: z.string().uuid().nullable(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if (value.importMode !== "selected_pages") return;
  const pages = value.allowedPageUrls.filter((url) => url.trim());
  if (!pages.length) context.addIssue({ code: "custom", path: ["allowedPageUrls"], message: "Aggiungi almeno una pagina da importare." });
  for (const page of pages) {
    if (!normalizeSystemePageUrl(page)) context.addIssue({ code: "custom", path: ["allowedPageUrls"], message: "Inserisci URL completi e validi, ad esempio https://tuosito.it/proprietari." });
  }
});

export function normalizeSystemeAllowedPages(pages: string[]) {
  return [...new Set(pages.map(normalizeSystemePageUrl).filter((url): url is string => Boolean(url)))];
}

export type SystemeSettings = z.infer<typeof systemeSettingsSchema>;
export type SystemeSettingsState = {
  serverReady: boolean;
  connection: {
    id: string;
    enabled: boolean;
    importMode: "all" | "selected_pages";
    allowedPageUrls: string[];
    destinationStageId: string | null;
    updatedAt: string;
    webhookUrl: string;
    hasSecret: boolean;
    secretRotatedAt: string | null;
  } | null;
  stages: { id: string; name: string }[];
  events: {
    id: string;
    status: "received" | "imported" | "updated" | "ignored" | "failed";
    reason: string | null;
    sourcePageUrl: string | null;
    receivedAt: string;
    contactName: string | null;
  }[];
};

export const systemeReasonLabels: Record<string, string> = {
  connection_disabled: "Importazione in pausa",
  profile_inactive: "Account non attivo",
  marketing_access_required: "Accesso al Modulo Marketing scaduto",
  unsupported_event: "Evento diverso da Opt-In",
  unsupported_schema: "Formato webhook non supportato",
  invalid_payload: "Dati del contatto non validi",
  missing_name: "Nome mancante nel form Systeme.io",
  source_page_missing: "Pagina di provenienza assente: filtro non verificabile",
  page_filtered: "Pagina esclusa dal filtro",
  crm_not_ready: "Pipeline CRM da configurare",
  ambiguous_contact: "Più contatti CRM con la stessa email: verifica i duplicati",
  import_failed: "Errore temporaneo: Systeme.io potrà ritentare l'invio",
};
