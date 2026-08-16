import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/env";
import type { Database, Json } from "@/lib/supabase/database.types";

type ServiceClient = SupabaseClient<Database>;

export const transactionalEmailTemplateIds = [
  "pm.welcome",
  "pm.verified",
  "admin.owner_request_pending",
  "lead.purchased",
  "admin.lead_purchased",
  "wallet.top_up",
  "lead.new_available",
  "prime.lead_assigned",
  "lead.digest",
  "owner.completion_requested",
  "admin.support_request_pending",
  "admin.support_request_reply",
  "support.reply",
  "addon.marketing_activated",
  "admin.addon_marketing_activated",
  "prime.subscription_activated",
  "admin.prime_subscription_activated",
  "prime.subscription_renewed",
  "admin.prime_subscription_renewed",
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
    description: "Invio ai Super Admin quando arriva una nuova richiesta proprietario da verificare.",
    enabled: true,
    subject: "Nuovo lead proprietario da verificare: {{city}}",
    preview: "Un proprietario ha inviato una nuova richiesta.",
    title: "Nuovo lead proprietario da verificare.",
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
    id: "admin.lead_purchased",
    label: "Nuova vendita lead agli admin",
    description: "Invio ai Super Admin quando un Property Manager completa l'acquisto di un lead.",
    enabled: true,
    subject: "Nuova vendita Lead: {{lead_title}}",
    preview: "Un Property Manager ha acquistato un lead.",
    title: "Nuova vendita Lead completata.",
    body:
      '{{property_manager_name}} ({{property_manager_email}}) ha acquistato il lead "{{lead_title}}" in modalita {{purchase_mode_label}}.',
    extra:
      "Importo: {{amount}}. Saldo wallet residuo del PM: {{wallet_balance}}. ID acquisto: {{purchase_id}}.",
    ctaLabel: "Apri pagamenti admin",
    ctaUrl: "/admin/pagamenti",
    variables: [
      "property_manager_name",
      "property_manager_email",
      "lead_title",
      "purchase_mode",
      "purchase_mode_label",
      "amount",
      "wallet_balance",
      "purchase_id",
    ],
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
    extra: "Saldo wallet aggiornato: {{wallet_balance}}.{{bonus_message}}",
    ctaLabel: "Apri wallet",
    ctaUrl: "/app/acquisti",
    variables: [
      "amount",
      "wallet_balance",
      "bonus_amount",
      "wallet_credit",
      "coupon_code",
      "bonus_message",
    ],
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
    id: "prime.lead_assigned",
    label: "Nuova opportunità PRIME",
    description:
      "Invio esclusivo al Property Manager quando un lead viene assegnato alla sua Prime Zone.",
    enabled: true,
    subject: "Nuova opportunità nella tua Prime Zone: {{lead_title}}",
    preview: "Una nuova opportunità è stata riservata al tuo account PRIME.",
    title: "Nuova opportunità nella tua Prime Zone.",
    body:
      "Il team Lead Host ti ha riservato {{lead_title}}{{city_suffix}}. Puoi visualizzarla e acquistarla in esclusiva prima della pubblicazione nel Marketplace.",
    extra: "Accesso riservato fino al {{access_until}}.",
    ctaLabel: "Apri la Prime Zone",
    ctaUrl: "{{prime_lead_url}}",
    variables: [
      "lead_title",
      "city",
      "city_suffix",
      "access_until",
      "prime_lead_url",
    ],
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
  {
    id: "owner.completion_requested",
    label: "Completa richiesta proprietario",
    description: "Invio al proprietario quando un lead esterno richiede dati mancanti.",
    enabled: true,
    subject: "Completa la tua richiesta su Lead Host",
    preview: "Ci mancano pochi dati per inviare la tua richiesta in verifica.",
    title: "Ti manca un ultimo passaggio.",
    body:
      "Abbiamo ricevuto la tua richiesta per {{property_hint}}. Completa i dati mancanti così il team Lead Host potrà verificarla.",
    extra: "Il link è personale e scade il {{expires_at}}.",
    ctaLabel: "Completa richiesta",
    ctaUrl: "{{completion_url}}",
    variables: ["property_hint", "completion_url", "expires_at"],
  },
  {
    id: "admin.support_request_pending",
    label: "Nuova richiesta assistenza agli admin",
    description: "Invio ai Super Admin quando un PM invia una richiesta di assistenza.",
    enabled: true,
    subject: "Nuova richiesta di assistenza da {{property_manager_name}}",
    preview: "Un Property Manager ha inviato una nuova richiesta.",
    title: "Nuova richiesta di assistenza.",
    body:
      "{{property_manager_name}} ha inviato: {{request_subject}}. {{lead_context}}",
    extra: "{{request_details}}",
    ctaLabel: "Apri richieste assistenza",
    ctaUrl: "/admin/segnalazioni",
    variables: [
      "property_manager_name",
      "property_manager_email",
      "request_subject",
      "request_details",
      "lead_context",
    ],
  },
  {
    id: "support.reply",
    label: "Risposta assistenza",
    description: "Invio al PM quando un Super Admin risponde a una richiesta.",
    enabled: true,
    subject: "Risposta alla tua richiesta su Lead Host",
    preview: "Il team Lead Host ha risposto alla tua richiesta.",
    title: "Abbiamo risposto alla tua richiesta.",
    body: "La tua richiesta: {{request_subject}}.",
    extra: "{{reply}}",
    ctaLabel: "Apri assistenza",
    ctaUrl: "/app/assistenza",
    variables: ["request_subject", "reply", "lead_context"],
  },
  {
    id: "admin.support_request_reply",
    label: "Risposta PM all'assistenza",
    description: "Invio ai Super Admin quando un PM risponde a una richiesta esistente.",
    enabled: true,
    subject: "Nuova risposta alla richiesta di {{property_manager_name}}",
    preview: "Un Property Manager ha aggiunto un messaggio alla richiesta.",
    title: "Nuova risposta all'assistenza.",
    body:
      "{{property_manager_name}} ha risposto alla richiesta: {{request_subject}}. {{lead_context}}",
    extra: "{{reply}}",
    ctaLabel: "Apri conversazione",
    ctaUrl: "/admin/segnalazioni",
    variables: [
      "property_manager_name",
      "property_manager_email",
      "request_subject",
      "reply",
      "lead_context",
    ],
  },
  {
    id: "addon.marketing_activated",
    label: "Modulo Marketing attivato",
    description: "Invio al PM quando il trial o l'abbonamento del Modulo Marketing viene attivato.",
    enabled: true,
    subject: "Modulo Marketing attivato su Lead Host",
    preview: "La tua prova gratuita del Modulo Marketing è iniziata.",
    title: "Modulo Marketing attivato{{first_name_suffix}}.",
    body:
      "Il Modulo Marketing è ora disponibile nel tuo account Lead Host. Puoi utilizzare CRM e Rendita Stimata durante il periodo di prova.",
    extra:
      "Prova gratuita: {{trial_days}} giorni. Scadenza prova: {{trial_end_date}}. Primo pagamento: {{first_payment_amount}} il {{first_payment_date}}.",
    ctaLabel: "Apri il Modulo Marketing",
    ctaUrl: "/app/marketing",
    variables: [
      "first_name",
      "first_name_suffix",
      "addon_name",
      "trial_days",
      "trial_end_date",
      "first_payment_date",
      "first_payment_amount",
      "subscription_status",
    ],
  },
  {
    id: "admin.addon_marketing_activated",
    label: "Nuovo cliente Modulo Marketing",
    description: "Invio ai Super Admin quando un PM attiva il trial o l'abbonamento del Modulo Marketing.",
    enabled: true,
    subject: "Nuovo cliente Modulo Marketing: {{customer_name}}",
    preview: "Un Property Manager ha attivato il Modulo Marketing.",
    title: "Nuova attivazione Modulo Marketing.",
    body:
      "{{customer_name}} ({{customer_email}}) ha attivato il Modulo Marketing con stato {{subscription_status}}.",
    extra:
      "Prova: {{trial_days}} giorni. Scadenza prova: {{trial_end_date}}. Primo pagamento: {{first_payment_amount}} il {{first_payment_date}}. ID abbonamento: {{subscription_id}}.",
    ctaLabel: "Apri pagamenti admin",
    ctaUrl: "/admin/pagamenti",
    variables: [
      "customer_name",
      "customer_email",
      "addon_name",
      "trial_days",
      "trial_end_date",
      "first_payment_date",
      "first_payment_amount",
      "subscription_status",
      "subscription_id",
    ],
  },
  {
    id: "prime.subscription_activated",
    label: "PRIME attivato",
    description: "Invio al PM dopo il pagamento iniziale e l’attivazione di Lead Host PRIME.",
    enabled: true,
    subject: "Lead Host PRIME è attivo",
    preview: "La tua Prime Zone e il credito Wallet sono disponibili.",
    title: "Benvenuto in Lead Host PRIME{{first_name_suffix}}.",
    body:
      "Il pagamento iniziale è stato confermato. La tua Prime Zone è attiva e puoi continuare a utilizzare anche il Marketplace pubblico.",
    extra:
      "Membership: {{membership_amount}}. Credito aggiunto al Wallet: {{wallet_recharge}}. Saldo Wallet: {{wallet_balance}}.",
    ctaLabel: "Apri la Prime Zone",
    ctaUrl: "/app/prime",
    variables: [
      "first_name",
      "first_name_suffix",
      "membership_amount",
      "wallet_recharge",
      "wallet_balance",
      "invoice_total",
      "billing_period_end",
    ],
  },
  {
    id: "admin.prime_subscription_activated",
    label: "Nuovo cliente PRIME agli admin",
    description: "Invio ai Super Admin dopo la prima attivazione a pagamento di PRIME.",
    enabled: true,
    subject: "Nuovo cliente Lead Host PRIME: {{customer_name}}",
    preview: "Un Property Manager ha attivato Lead Host PRIME.",
    title: "Nuova attivazione Lead Host PRIME.",
    body:
      "{{customer_name}} ({{customer_email}}) ha completato il primo pagamento PRIME.",
    extra:
      "Membership: {{membership_amount}}. Ricarica Wallet: {{wallet_recharge}}. Totale: {{invoice_total}}. ID fattura Stripe: {{stripe_invoice_id}}.",
    ctaLabel: "Apri Lead Host PRIME",
    ctaUrl: "/admin/prime",
    variables: [
      "customer_name",
      "customer_email",
      "membership_amount",
      "wallet_recharge",
      "invoice_total",
      "stripe_invoice_id",
      "billing_period_end",
    ],
  },
  {
    id: "prime.subscription_renewed",
    label: "Rinnovo PRIME",
    description: "Invio al PM dopo ogni rinnovo mensile PRIME riuscito.",
    enabled: true,
    subject: "Rinnovo Lead Host PRIME completato",
    preview: "Il rinnovo è confermato e il credito Wallet è stato aggiunto.",
    title: "Rinnovo PRIME completato{{first_name_suffix}}.",
    body:
      "Il rinnovo mensile di Lead Host PRIME è stato confermato. La tua Prime Zone resta attiva.",
    extra:
      "Membership: {{membership_amount}}. Credito aggiunto al Wallet: {{wallet_recharge}}. Saldo Wallet: {{wallet_balance}}.",
    ctaLabel: "Apri la Prime Zone",
    ctaUrl: "/app/prime",
    variables: [
      "first_name",
      "first_name_suffix",
      "membership_amount",
      "wallet_recharge",
      "wallet_balance",
      "invoice_total",
      "billing_period_end",
    ],
  },
  {
    id: "admin.prime_subscription_renewed",
    label: "Rinnovo PRIME agli admin",
    description: "Invio ai Super Admin dopo ogni rinnovo mensile PRIME riuscito.",
    enabled: true,
    subject: "Rinnovo Lead Host PRIME: {{customer_name}}",
    preview: "Un cliente ha rinnovato Lead Host PRIME.",
    title: "Rinnovo Lead Host PRIME completato.",
    body:
      "{{customer_name}} ({{customer_email}}) ha completato il rinnovo mensile PRIME.",
    extra:
      "Membership: {{membership_amount}}. Ricarica Wallet: {{wallet_recharge}}. Totale: {{invoice_total}}. ID fattura Stripe: {{stripe_invoice_id}}.",
    ctaLabel: "Apri Lead Host PRIME",
    ctaUrl: "/admin/prime",
    variables: [
      "customer_name",
      "customer_email",
      "membership_amount",
      "wallet_recharge",
      "invoice_total",
      "stripe_invoice_id",
      "billing_period_end",
    ],
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
