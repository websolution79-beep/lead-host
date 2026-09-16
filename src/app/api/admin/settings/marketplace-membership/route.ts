import { NextResponse, type NextRequest } from "next/server";
import { AdminApiError, adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { marketplaceMembershipSettingsSchema } from "@/lib/marketplace-membership/policy";
import {
  fetchMarketplaceMembershipSettings, MARKETPLACE_MEMBERSHIP_SETTINGS_KEY,
  MARKETPLACE_MEMBERSHIP_ROLLOUT_READY,
} from "@/lib/marketplace-membership/settings";

async function context(request: NextRequest) {
  const result = await requireSuperAdmin(request);
  if (!result.isSuperAdmin) throw new AdminApiError(403, "Ruolo Super Admin richiesto.");
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await context(request);
    return NextResponse.json({ ...await fetchMarketplaceMembershipSettings(supabase),
      activationAvailable: MARKETPLACE_MEMBERSHIP_ROLLOUT_READY },
    { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminApiErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await context(request);
    const parsed = marketplaceMembershipSettingsSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Controlla i valori inseriti." }, { status: 422 });
    const settings = parsed.data;
    if (settings.paidAccessEnabled && !MARKETPLACE_MEMBERSHIP_ROLLOUT_READY) {
      throw new AdminApiError(409, "L'attivazione a pagamento non e ancora disponibile.");
    }
    const previous = await fetchMarketplaceMembershipSettings(supabase);
    if (!previous.storageReady) throw new AdminApiError(409, "Configurazione Marketplace non disponibile.");
    const { error } = await supabase.from("settings").update({
      value: settings, updated_by: profile.id,
    }).eq("key", MARKETPLACE_MEMBERSHIP_SETTINGS_KEY);
    if (error) throw error;
    await writeAdminAuditLog({ supabase, request, actorProfileId: profile.id, isSuperAdmin,
      entityType: "marketplace_membership_settings", action: "settings.marketplace_membership_updated",
      before: previous.settings, after: settings });
    return NextResponse.json({ settings, storageReady: true,
      activationAvailable: MARKETPLACE_MEMBERSHIP_ROLLOUT_READY });
  } catch (error) { return adminApiErrorResponse(error); }
}
