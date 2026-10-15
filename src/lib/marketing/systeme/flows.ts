import { z } from "zod";
import { normalizeSystemePageUrl } from "./payload";

export const systemeFieldTargets = [
  "full_name", "first_name", "last_name", "email", "phone", "property_address",
  "city", "province", "region", "property_type", "bedrooms", "bathrooms", "area_sqm",
  "current_status", "requested_services", "timing", "property_description", "additional", "ignore",
] as const;

export const systemeFieldBindingSchema = z.object({
  sourceSlug: z.string().trim().toLowerCase().min(1).max(160),
  targetField: z.enum(systemeFieldTargets),
  additionalLabel: z.string().trim().min(1).max(120).nullable(),
}).strict().superRefine((binding, context) => {
  if ((binding.targetField === "additional") !== (binding.additionalLabel !== null)) {
    context.addIssue({ code: "custom", path: ["additionalLabel"], message: "Imposta un'etichetta solo per le risposte aggiuntive." });
  }
});

const pageSchema = z.string().trim().max(8192).transform((value, context) => {
  const normalized = normalizeSystemePageUrl(value);
  if (normalized) return normalized;
  context.addIssue({ code: "custom", message: "Inserisci un URL completo e valido." });
  return z.NEVER;
});

export const systemeFlowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  importMode: z.enum(["all", "selected_pages"]),
  allowedPageUrls: z.array(pageSchema).max(50),
  destinationStageId: z.string().uuid().nullable(),
  bindings: z.array(systemeFieldBindingSchema).max(200),
}).strict().superRefine((flow, context) => {
  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: "custom", path, message });
  if (flow.importMode === "all" && flow.allowedPageUrls.length) issue(["allowedPageUrls"], "Il flusso generale non deve indicare pagine specifiche.");
  if (flow.importMode === "selected_pages" && !flow.allowedPageUrls.length) issue(["allowedPageUrls"], "Aggiungi almeno una pagina al flusso.");
  if (new Set(flow.allowedPageUrls).size !== flow.allowedPageUrls.length) issue(["allowedPageUrls"], "La stessa pagina compare piu volte nel flusso.");

  const sources = new Set<string>();
  const targets = new Set<string>();
  const labels = new Set<string>();
  flow.bindings.forEach((binding, index) => {
    if (sources.has(binding.sourceSlug)) issue(["bindings", index, "sourceSlug"], "Questo campo di origine e gia associato.");
    sources.add(binding.sourceSlug);
    if (!["additional", "ignore"].includes(binding.targetField)) {
      if (targets.has(binding.targetField)) issue(["bindings", index, "targetField"], "La destinazione e gia associata a un altro campo.");
      targets.add(binding.targetField);
    }
    if (binding.additionalLabel) {
      const label = binding.additionalLabel.toLowerCase();
      if (labels.has(label)) issue(["bindings", index, "additionalLabel"], "Usa etichette distinte per le risposte aggiuntive.");
      labels.add(label);
    }
  });
  // A full-name mapping is exclusive: never silently discard explicitly mapped name parts.
  if (targets.has("full_name") && (targets.has("first_name") || targets.has("last_name"))) {
    issue(["bindings"], "Associa il nome completo oppure nome e cognome separati, non entrambi.");
  }
  if (flow.enabled) {
    if (!targets.has("full_name") && !targets.has("first_name") && !targets.has("last_name")) issue(["bindings"], "Associa un campo per il nome prima di attivare il flusso.");
    if (!targets.has("email")) issue(["bindings"], "Associa l'email prima di attivare il flusso.");
  }
});

export const systemeFlowListSchema = z.array(systemeFlowSchema).max(20).superRefine((flows, context) => {
  const ids = new Set<string>();
  const names = new Set<string>();
  const pages = new Set<string>();
  let hasFallback = false;
  flows.forEach((flow, index) => {
    const issue = (field: string, message: string) => context.addIssue({ code: "custom", path: [index, field], message });
    if (ids.has(flow.id)) issue("id", "Il flusso e duplicato.");
    ids.add(flow.id);
    if (names.has(flow.name.toLowerCase())) issue("name", "Usa un nome diverso per ogni flusso.");
    names.add(flow.name.toLowerCase());
    if (flow.importMode === "all") {
      if (hasFallback) issue("importMode", "Puoi configurare un solo flusso generale.");
      hasFallback = true;
    }
    for (const page of flow.allowedPageUrls) {
      if (pages.has(page)) issue("allowedPageUrls", "La pagina e gia riservata da un altro flusso, anche se in pausa.");
      pages.add(page);
    }
  });
});

export const systemeFlowsSettingsSchema = z.object({
  version: z.literal(2),
  updatedAt: z.string().datetime({ offset: true }),
  enabled: z.boolean(),
  flows: systemeFlowListSchema,
}).strict().superRefine((settings, context) => {
  if (settings.enabled && !settings.flows.some((flow) => flow.enabled)) {
    context.addIssue({ code: "custom", path: ["flows"], message: "Attiva almeno un flusso prima di avviare l'importazione." });
  }
});

export type SystemeFieldBinding = z.infer<typeof systemeFieldBindingSchema>;
export type SystemeFlow = z.infer<typeof systemeFlowSchema>;

export function selectSystemeFlow(flows: readonly SystemeFlow[], sourcePageUrl: string | null) {
  const page = normalizeSystemePageUrl(sourcePageUrl);
  // Paused specific flows reserve their pages too; filtering enabled flows here would leak into the fallback.
  return (page ? flows.find((flow) => flow.importMode === "selected_pages" && flow.allowedPageUrls.includes(page)) : null)
    ?? flows.find((flow) => flow.importMode === "all") ?? null;
}
