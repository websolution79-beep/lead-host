import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AdminApiError } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { requireMarketingAddonAccess } from "@/lib/addons/access";
import { getEnv } from "@/lib/env";
import { decryptSystemeSecret } from "@/lib/marketing/systeme/crypto";
import { systemeFlowCommandSchema, systemeFlowSnapshotSchema, systemeKnownFieldSchema } from "@/lib/marketing/systeme/flows";

function respond(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function errorResponse(error: unknown) {
  if (error instanceof AdminApiError) return respond({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return respond({ error: error.issues[0]?.message ?? "Controlla la configurazione del flusso." }, 422);
  if (error && typeof error === "object" && "code" in error && ["22023", "23505", "23514", "23503"].includes(String(error.code))) {
    return respond({ error: "Controlla pagine, fase CRM e associazioni: non possono essere duplicate o appartenere ad altri flussi." }, 422);
  }
  console.error("Systeme.io flow configuration temporarily unavailable.");
  return respond({ error: "Configurazione flussi non disponibile. Riprova tra poco." }, 503);
}

async function connection(context: Awaited<ReturnType<typeof requireMarketingAddonAccess>>) {
  const result = await context.supabase.from("marketing_systeme_integrations").select("id")
    .eq("profile_id", context.profile.id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new AdminApiError(404, "Crea prima il collegamento Systeme.io.");
  return result.data;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireMarketingAddonAccess(request);
    const current = await connection(context);
    const result = await context.supabase.rpc("marketing_systeme_flow_snapshot", { p_integration_id: current.id, p_profile_id: context.profile.id });
    if (result.error) throw result.error;
    const catalog = await context.supabase.rpc("marketing_systeme_discovery_catalog", { p_integration_id: current.id, p_profile_id: context.profile.id });
    if (catalog.error) throw catalog.error;
    const knownFields = z.array(systemeKnownFieldSchema).max(1000).parse(catalog.data);
    return respond({ snapshot: systemeFlowSnapshotSchema.parse(result.data), knownFields });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireMarketingAddonAccess(request);
    const payload = systemeFlowCommandSchema.parse(await request.json());
    const current = await connection(context);
    if (payload.command.action === "set_enabled" && payload.command.enabled) {
      const key = getEnv("MARKETING_INTEGRATIONS_ENCRYPTION_KEY");
      const secret = await context.supabase.from("marketing_systeme_webhook_secrets").select("encrypted_secret")
        .eq("integration_id", current.id).maybeSingle();
      if (secret.error) throw secret.error;
      if (!key || !secret.data) throw new AdminApiError(422, "Completa il collegamento prima di attivare l'importazione.");
      try { decryptSystemeSecret(secret.data.encrypted_secret, current.id, key); }
      catch { throw new AdminApiError(422, "Il collegamento richiede una verifica del segreto. Contatta l'assistenza."); }
    }
    const result = await context.supabase.rpc("configure_marketing_systeme_flows", {
      p_integration_id: current.id, p_profile_id: context.profile.id,
      p_expected_token: payload.configurationToken, p_command: payload.command,
    });
    if (result.error) throw result.error;
    const outcome = z.object({ status: z.enum(["saved", "conflict", "not_found", "access_denied"]), snapshot: systemeFlowSnapshotSchema.optional() }).parse(result.data);
    if (outcome.status === "conflict") throw new AdminApiError(409, "La configurazione e cambiata. Ricarica la pagina prima di salvare.");
    if (outcome.status === "access_denied") throw new AdminApiError(403, "Il Modulo Marketing non e attivo.");
    if (outcome.status === "not_found") throw new AdminApiError(404, "Collegamento o flusso non trovato.");
    if (!outcome.snapshot) throw new Error("Missing saved snapshot");
    await writeAdminAuditLog({
      supabase: context.supabase, request, actorProfileId: context.profile.id, isSuperAdmin: context.isSuperAdmin,
      actorRole: context.isSuperAdmin ? "super_admin" : "property_manager", entityType: "marketing_systeme_integration",
      entityId: current.id, action: `flows.${payload.command.action}`,
      after: { flowCount: outcome.snapshot.flows.length, enabled: outcome.snapshot.enabled },
    });
    return respond({ snapshot: outcome.snapshot });
  } catch (error) { return errorResponse(error); }
}
