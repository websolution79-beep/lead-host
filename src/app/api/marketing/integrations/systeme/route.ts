import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AdminApiError } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { requireMarketingAddonAccess } from "@/lib/addons/access";
import { getEnv, getRequestAppUrl } from "@/lib/env";
import { decryptSystemeSecret, encryptSystemeSecret, generateSystemeSigningSecret } from "@/lib/marketing/systeme/crypto";
import { systemeWebhookOrigin } from "@/lib/marketing/systeme/origin";
import { normalizeSystemeAllowedPages, systemeSettingsSchema, type SystemeSettingsState } from "@/lib/marketing/systeme/settings";

type Context = Awaited<ReturnType<typeof requireMarketingAddonAccess>>;
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create") }).strict(),
  z.object({ action: z.literal("rotate_secret"), expectedRotatedAt: z.string().datetime({ offset: true }) }).strict(),
]);

function respond(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function errorResponse(error: unknown) {
  if (error instanceof AdminApiError) return respond({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return respond({ error: error.issues[0]?.message ?? "Controlla i dati inseriti." }, 422);
  console.error("Systeme.io connection settings unavailable.");
  return respond({ error: "Non riesco ad aggiornare il collegamento. Riprova tra poco." }, 500);
}

async function connection(context: Context) {
  const result = await context.supabase.from("marketing_systeme_integrations").select("*")
    .eq("profile_id", context.profile.id).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function stages(context: Context) {
  const pipeline = await context.supabase.from("marketing_crm_pipelines").select("id")
    .eq("profile_id", context.profile.id).eq("is_default", true).maybeSingle();
  if (pipeline.error) throw pipeline.error;
  if (!pipeline.data) return [];
  const result = await context.supabase.from("marketing_crm_stages").select("id,name")
    .eq("pipeline_id", pipeline.data.id).order("position").order("created_at");
  if (result.error) throw result.error;
  return result.data;
}

function encryptionKey() {
  const key = getEnv("MARKETING_INTEGRATIONS_ENCRYPTION_KEY");
  if (!key || !/^[A-Za-z0-9+/]{43}=$/.test(key)) return null;
  return key;
}

async function state(request: NextRequest, context: Context): Promise<SystemeSettingsState> {
  const current = await connection(context);
  const availableStages = await stages(context);
  const key = encryptionKey();
  if (!current) return { serverReady: Boolean(key), connection: null, stages: availableStages, events: [] };
  const [secretResult, eventResult] = await Promise.all([
    context.supabase.from("marketing_systeme_webhook_secrets").select("encrypted_secret,rotated_at")
      .eq("integration_id", current.id).maybeSingle(),
    context.supabase.from("marketing_systeme_webhook_events")
      .select("id,status,reason_code,source_page_url,received_at,crm_contact_id")
      .eq("integration_id", current.id).eq("profile_id", context.profile.id)
      .order("received_at", { ascending: false }).limit(25),
  ]);
  if (secretResult.error) throw secretResult.error;
  if (eventResult.error) throw eventResult.error;
  let serverReady = Boolean(key);
  if (key && secretResult.data) {
    try { decryptSystemeSecret(secretResult.data.encrypted_secret, current.id, key); } catch { serverReady = false; }
  }
  const contactIds = [...new Set(eventResult.data.flatMap((event) => event.crm_contact_id ? [event.crm_contact_id] : []))];
  const names = new Map<string, string>();
  if (contactIds.length) {
    const contacts = await context.supabase.from("marketing_crm_contacts").select("id,full_name")
      .eq("profile_id", context.profile.id).in("id", contactIds);
    if (contacts.error) throw contacts.error;
    for (const contact of contacts.data) names.set(contact.id, contact.full_name);
  }
  return {
    serverReady,
    connection: {
      id: current.id, enabled: current.enabled, importMode: current.import_mode,
      allowedPageUrls: current.allowed_page_urls, destinationStageId: current.destination_stage_id,
      updatedAt: current.updated_at, webhookUrl: `${systemeWebhookOrigin(getRequestAppUrl(request), process.env)}/api/webhooks/systeme/${current.id}`,
      hasSecret: Boolean(secretResult.data), secretRotatedAt: secretResult.data?.rotated_at ?? null,
    },
    stages: availableStages,
    events: eventResult.data.map((event) => ({
      id: event.id, status: event.status, reason: event.reason_code, sourcePageUrl: event.source_page_url,
      receivedAt: event.received_at, contactName: event.crm_contact_id ? names.get(event.crm_contact_id) ?? null : null,
    })),
  };
}

export async function GET(request: NextRequest) {
  try {
    return respond(await state(request, await requireMarketingAddonAccess(request)));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireMarketingAddonAccess(request);
    const payload = actionSchema.parse(await request.json());
    const key = encryptionKey();
    if (!key) throw new AdminApiError(503, "Il collegamento non è ancora disponibile. Contatta l'assistenza Lead Host.");
    let current = await connection(context);
    if (payload.action === "create") {
      if (!(await stages(context)).length) throw new AdminApiError(422, "Prepara la pipeline CRM prima di creare il collegamento.");
      if (!current) {
        const inserted = await context.supabase.from("marketing_systeme_integrations")
          .insert({ id: randomUUID(), profile_id: context.profile.id }).select("*").single();
        if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
        current = inserted.data ?? await connection(context);
      }
    }
    if (!current) throw new AdminApiError(404, "Crea prima il collegamento Systeme.io.");
    const secret = generateSystemeSigningSecret();
    const encrypted = encryptSystemeSecret(secret, current.id, key);
    if (payload.action === "create") {
      const inserted = await context.supabase.from("marketing_systeme_webhook_secrets")
        .insert({ integration_id: current.id, encrypted_secret: encrypted });
      if (inserted.error?.code === "23505") throw new AdminApiError(409, "Il collegamento esiste già. Aggiorna la pagina per visualizzarlo.");
      if (inserted.error) throw inserted.error;
    } else {
      const rotated = await context.supabase.from("marketing_systeme_webhook_secrets")
        .update({ encrypted_secret: encrypted, rotated_at: new Date().toISOString() })
        .eq("integration_id", current.id).eq("rotated_at", payload.expectedRotatedAt)
        .select("integration_id").maybeSingle();
      if (rotated.error) throw rotated.error;
      if (!rotated.data) throw new AdminApiError(409, "Il segreto è stato aggiornato da un'altra sessione. Ricarica la pagina.");
    }
    await writeAdminAuditLog({
      supabase: context.supabase, request, actorProfileId: context.profile.id, isSuperAdmin: context.isSuperAdmin,
      actorRole: context.isSuperAdmin ? "super_admin" : "property_manager", entityType: "marketing_systeme_integration",
      entityId: current.id, action: payload.action === "create" ? "created" : "secret_rotated",
    });
    return respond({ ...await state(request, context), oneTimeSecret: secret });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireMarketingAddonAccess(request);
    const payload = systemeSettingsSchema.parse(await request.json());
    const currentState = await state(request, context);
    if (!currentState.connection) throw new AdminApiError(404, "Crea prima il collegamento Systeme.io.");
    if (payload.enabled && (!currentState.serverReady || !currentState.connection.hasSecret)) {
      throw new AdminApiError(422, "Completa la configurazione del collegamento prima di attivarlo.");
    }
    if (!currentState.stages.length || (payload.destinationStageId && !currentState.stages.some((stage) => stage.id === payload.destinationStageId))) {
      throw new AdminApiError(422, "Scegli una fase valida della tua pipeline CRM.");
    }
    const updated = await context.supabase.from("marketing_systeme_integrations").update({
      enabled: payload.enabled, import_mode: payload.importMode,
      allowed_page_urls: normalizeSystemeAllowedPages(payload.allowedPageUrls), destination_stage_id: payload.destinationStageId,
    }).eq("id", currentState.connection.id).eq("profile_id", context.profile.id).eq("updated_at", payload.updatedAt)
      .select("id").maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) throw new AdminApiError(409, "Le impostazioni sono cambiate in un'altra sessione. Ricarica la pagina prima di salvare.");
    await writeAdminAuditLog({
      supabase: context.supabase, request, actorProfileId: context.profile.id, isSuperAdmin: context.isSuperAdmin,
      actorRole: context.isSuperAdmin ? "super_admin" : "property_manager", entityType: "marketing_systeme_integration",
      entityId: currentState.connection.id, action: "settings_updated",
      after: { enabled: payload.enabled, importMode: payload.importMode, pageCount: payload.allowedPageUrls.length },
    });
    return respond(await state(request, context));
  } catch (error) { return errorResponse(error); }
}
