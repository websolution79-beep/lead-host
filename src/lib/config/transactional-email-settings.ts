import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/env";
import type { Database, Json } from "@/lib/supabase/database.types";

type ServiceClient = SupabaseClient<Database>;

export const transactionalEmailTemplateIds = [
  "pm.welcome",
  "pm.verified",
  "admin.owner_request_pending",
  "lead.purchased",
  "wallet.top_up",
  "lead.new_available",
  "lead.digest",
] as const;

export type TransactionalEmailTemplateId =
  (typeof transactionalEmailTemplateIds)[number];

export type EmailTemplateVariables = Record<
  string,
  string | number | null | undefined
>;

export type TransactionalEmailTemplate = {
  id: TransactionalEmailTemplateId;
  label: string;
  description: string;
  enabled: boolean;
  subject: string;
  preview: string;
  title: string;
  body: string;
  extra: string;
  ctaLabel: string;
  ctaUrl: string;
  variables: string[];
};

export type RenderedTransactionalEmail = {
  subject: string;
  preview: string;
  html: string;
  text: string;
};

const SETTINGS_KEY = "email.transactional_templates";

export const defaultTransactionalEmailTemplates: TransactionalEmailTemplate[] = [
  {
    id: "pm.welcome",
    label: "Benvenuto PM",
    description: "Invio dopo conferma email o primo login del Property Manager.",
    enabled: true,
    subject: "Benvenuto in Lead Host",
    preview: "Il tuo account Property Manager è stato creato.",
    title: "Benvenuto{{first_name_suffix}}.",
    body:
      "Il tuo account gratuito Lead Host è attivo. Puoi accedere subito al marketplace, consultare le opportunità disponibili e sbloccare i contatti usando il credito del wallet.",
    extra:
      "I dati di fatturazione ti verranno richiesti solo quando dovrai gestire una ricarica wallet o le relative fatture.",
    ctaLabel: "Apri il marketplace",
    ctaUrl: "/app/marketplace",
    variables: ["first_name", "first_name_suffix"],
  },
  {
    id: "pm.verified",
    label: "PM verificato",
    description: "Invio quando un Super Admin verifica il Property Manager.",
    enabled: true,
    subject: "Profilo verificato su Lead Host",
    preview: "Il team Lead Host ha verificato il tuo profilo.",
    title: "Profilo verificato{{first_name_suffix}}.",
    body:
      "Il tuo profilo Property Manager è stato verificato dal team Lead Host. Puoi continuare a consultare il marketplace e acquistare lead tramite il credito disponibile nel wallet.",
    extra: "",
    ctaLabel: "Apri il marketplace",
    ctaUrl: "/app/marketplace",
    variables: ["first_name", "first_name_suffix"],
  },
  {
    id: "admin.owner_request_pending",
    label: "Nuovo lead agli admin",
    description: "Invio ai Super Admin quando arriva una richiesta proprietario pending.",
    enabled: true,
    subject: "Nuovo lead proprietario da verificare: {{city}}",
    preview: "Un proprietario ha inviato una nuova richiesta.",
    title: "Nuovo lead proprietario in pending.",
    body:
      "{{property_type}} a {{city}}. Entra in area admin per verificare i dati e decidere se pubblicarlo nel marketplace.",
    extra: "Codice richiesta: {{reference}}",
    ctaLabel: "Apri lead admin",
    ctaUrl: "/admin/leads",
    variables: ["reference", "city", "property_type"],
  },
  {
    id: "lead.purchased",
    label: "Lead acquistato",
    description: "Invio al PM dopo acquisto lead tramite credito wallet.",
    enabled: true,
    subject: "Lead acquistato: {{lead_title}}",
    preview: "Il contatto proprietario è ora disponibile nei tuoi lead.",
    title: "Acquisto lead completato.",
    body:
      'Hai acquistato il lead "{{lead_title}}" in modalità {{purchase_mode_label}}. Il contatto è ora disponibile nella sezione I miei lead.',
    extra:
      "Importo: {{amount}}. Saldo wallet residuo: {{wallet_balance}}.",
    ctaLabel: "Apri i miei lead",
    ctaUrl: "/app/i-miei-lead",
    variables: ["lead_title", "purchase_mode_label", "amount", "wallet_balance"],
  },
  {
    id: "wallet.top_up",
    label: "Ricarica wallet",
    description: "Invio al PM quando una ricarica wallet viene confermata da Stripe.",
    enabled: true,
    subject: "Ricarica wallet completata: {{amount}}",
    preview: "Il credito e stato aggiunto al tuo wallet Lead Host.",
    title: "Ricarica wallet completata.",
    body:
      "Abbiamo aggiunto {{amount}} al tuo wallet Lead Host. Puoi usare subito il credito per acquistare lead nel marketplace.",
    extra: "Saldo wallet aggiornato: {{wallet_balance}}.",
    ctaLabel: "Apri wallet",
    ctaUrl: "/app/acquisti",
    variables: ["amount", "wallet_balance"],
  },
  {
    id: "lead.new_available",
    label: "Nuovo lead disponibile",
    description: "Invio ai PM che hanno scelto notifica immediata per ogni nuovo lead.",
    enabled: true,
    subject: "Nuovo lead disponibile: {{lead_title}}",
    preview: "Una nuova opportunità è stata pubblicata nel marketplace.",
    title: "Nuovo lead disponibile nel marketplace.",
    body:
      "{{lead_title}}{{city_suffix}}. Puoi consultare i dettagli pubblici e decidere se acquistarlo in condivisione o in esclusiva.",
    extra:
      "Prezzo condiviso: {{shared_price}}. Prezzo esclusivo: {{exclusive_price}}.",
    ctaLabel: "Vedi marketplace",
    ctaUrl: "/app/marketplace",
    variables: ["lead_title", "city", "city_suffix", "shared_price", "exclusive_price"],
  },
  {
    id: "lead.digest",
    label: "Riepilogo nuovi lead",
    description: "Invio riepilogativo giornaliero o ogni 3 giorni in base alle preferenze PM.",
    enabled: true,
    subject: "{{lead_count}} nuovi lead disponibili su Lead Host",
    preview: "Riepilogo delle nuove opportunità pubblicate nel marketplace.",
    title: "Nuovi lead disponibili.",
    body: "Ecco il riepilogo delle nuove opportunità pubblicate nel marketplace.",
    extra: "{{lead_list_text}}",
    ctaLabel: "Apri marketplace",
    ctaUrl: "/app/marketplace",
    variables: ["lead_count", "lead_list_text"],
  },
];

export async function fetchTransactionalEmailTemplates(supabase: ServiceClient) {
  const settingsTable = supabase.from("settings") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { key: string; value: Json } | null;
          error: { code?: string; message?: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await settingsTable
    .select("key,value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      return { templates: defaultTransactionalEmailTemplates, storageReady: false };
    }

    throw error;
  }

  return {
    templates: mergeTemplates(data?.value),
    storageReady: true,
  };
}

export async function saveTransactionalEmailTemplates({
  supabase,
  profileId,
  templates,
}: {
  supabase: ServiceClient;
  profileId: string;
  templates: TransactionalEmailTemplate[];
}) {
  const normalizedTemplates = mergeTemplates(templates as unknown as Json);
  const settingsTable = supabase.from("settings") as unknown as {
    upsert: (
      row: { key: string; value: Json; updated_by: string },
      options: { onConflict: string },
    ) => Promise<{ error: { code?: string; message?: string } | null }>;
  };
  const { error } = await settingsTable.upsert(
    {
      key: SETTINGS_KEY,
      value: normalizedTemplates as unknown as Json,
      updated_by: profileId,
    },
    { onConflict: "key" },
  );

  if (error) throw error;

  return normalizedTemplates;
}

export async function resolveTransactionalEmailTemplate(
  supabase: ServiceClient,
  id: TransactionalEmailTemplateId,
) {
  const { templates } = await fetchTransactionalEmailTemplates(supabase);

  return templates.find((template) => template.id === id) ?? getDefaultTemplate(id);
}

export function renderTransactionalEmailTemplate({
  template,
  variables,
}: {
  template: TransactionalEmailTemplate;
  variables: EmailTemplateVariables;
}): RenderedTransactionalEmail {
  const subject = applyVariables(template.subject, variables);
  const preview = applyVariables(template.preview, variables);
  const title = applyVariables(template.title, variables);
  const body = applyVariables(template.body, variables);
  const extra = applyVariables(template.extra, variables);
  const ctaLabel = applyVariables(template.ctaLabel, variables);
  const ctaUrl = resolveCtaUrl(applyVariables(template.ctaUrl, variables));

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f7f8fa;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preview)}</div>
    <main style="max-width:640px;margin:0 auto;padding:32px 18px;">
      <section style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;">
        <p style="margin:0 0 18px;color:#047857;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Lead Host</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.15;">${escapeHtml(title)}</h1>
        <p style="margin:0;color:#475569;font-size:16px;line-height:1.7;">${escapeHtml(body)}</p>
        ${extra ? `<p style="margin:18px 0 0;color:#0f172a;font-size:15px;line-height:1.6;font-weight:700;">${escapeHtml(extra).replaceAll("\n", "<br>")}</p>` : ""}
        ${
          ctaLabel && ctaUrl
            ? `<p style="margin:26px 0 0;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;padding:13px 18px;">${escapeHtml(ctaLabel)}</a></p>`
            : ""
        }
      </section>
      <p style="margin:18px 0 0;text-align:center;color:#94a3b8;font-size:12px;">Email transazionale inviata da Lead Host.</p>
    </main>
  </body>
</html>`;

  const text = [
    title,
    "",
    body,
    extra,
    ctaLabel && ctaUrl ? `${ctaLabel}: ${ctaUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, preview, html, text };
}

function mergeTemplates(value: Json | undefined): TransactionalEmailTemplate[] {
  const savedTemplates = Array.isArray(value)
    ? value
        .map((item) => parseTemplate(item))
        .filter((item): item is TransactionalEmailTemplate => Boolean(item))
    : [];
  const savedById = new Map(savedTemplates.map((template) => [template.id, template]));

  return defaultTransactionalEmailTemplates.map((defaultTemplate) => ({
    ...defaultTemplate,
    ...savedById.get(defaultTemplate.id),
    id: defaultTemplate.id,
    label: defaultTemplate.label,
    description: defaultTemplate.description,
    variables: defaultTemplate.variables,
  }));
}

function parseTemplate(value: Json): TransactionalEmailTemplate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, Json>;
  const id = String(record.id ?? "");

  if (!transactionalEmailTemplateIds.includes(id as TransactionalEmailTemplateId)) {
    return null;
  }

  const defaultTemplate = getDefaultTemplate(id as TransactionalEmailTemplateId);

  return {
    ...defaultTemplate,
    enabled:
      typeof record.enabled === "boolean" ? record.enabled : defaultTemplate.enabled,
    subject: parseText(record.subject, defaultTemplate.subject),
    preview: parseText(record.preview, defaultTemplate.preview),
    title: parseText(record.title, defaultTemplate.title),
    body: parseText(record.body, defaultTemplate.body),
    extra: parseText(record.extra, defaultTemplate.extra),
    ctaLabel: parseText(record.ctaLabel, defaultTemplate.ctaLabel),
    ctaUrl: parseText(record.ctaUrl, defaultTemplate.ctaUrl),
  };
}

function getDefaultTemplate(id: TransactionalEmailTemplateId) {
  return (
    defaultTransactionalEmailTemplates.find((template) => template.id === id) ??
    defaultTransactionalEmailTemplates[0]
  );
}

function parseText(value: Json | undefined, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function applyVariables(template: string, variables: EmailTemplateVariables) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key];

    return value === null || value === undefined ? "" : String(value);
  });
}

function resolveCtaUrl(value: string) {
  const cleanValue = value.trim();

  if (!cleanValue) return "";
  if (cleanValue.startsWith("http://") || cleanValue.startsWith("https://")) {
    return cleanValue;
  }

  return cleanValue.startsWith("/")
    ? `${appUrl}${cleanValue}`
    : `${appUrl}/${cleanValue}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isMissingRelationError(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST205" ||
    error.message?.toLowerCase().includes("could not find the table")
  );
}
