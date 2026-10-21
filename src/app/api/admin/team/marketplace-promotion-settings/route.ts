import { NextResponse, type NextRequest } from "next/server";
import { AdminApiError, adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  marketplacePromotionEngineReady,
  marketplacePromotionSettingsSchema,
} from "@/lib/team-compensation/marketplace-promotion-config";
import { fetchMarketplacePromotionSettings } from "@/lib/team-compensation/marketplace-promotion-settings";

const headers = { "Cache-Control": "private, no-store" };

async function requireSettingsAdmin(request: NextRequest) {
  const context = await requireSuperAdmin(request);
  if (!context.isSuperAdmin) throw new AdminApiError(403, "Impostazioni riservate al Super Admin.");
  return context;
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSettingsAdmin(request);
    return NextResponse.json(await fetchMarketplacePromotionSettings(supabase), { headers });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSettingsAdmin(request);
    const parsed = marketplacePromotionSettingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdminApiError(422, "Attesa o compenso non validi. Sono ammessi anche valori pari a zero.");
    if (parsed.data.enabled && !marketplacePromotionEngineReady) {
      throw new AdminApiError(409, "Attivazione non ancora disponibile: verifica vendite e rimborsi in corso.");
    }
    const before = await fetchMarketplacePromotionSettings(supabase);
    if (!before.storageReady) throw new AdminApiError(503, "Archivio promozioni non disponibile. Verifica la migration.");
    if (parsed.data.enabled && !before.engineReady) throw new AdminApiError(503, "Archivio compensi promozione non pronto. Verifica la migration.");
    if (parsed.data.enabled && !before.compensationEnabled) throw new AdminApiError(409, "Attiva prima il motore compensi generale.");
    const rpc = supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>;
    };
    const { data, error } = await rpc.rpc("save_marketplace_promotion_settings", {
      p_actor_profile_id: profile.id,
      p_enabled: parsed.data.enabled,
      p_wait_minutes: parsed.data.waitMinutes,
      p_sale_cents: parsed.data.saleCents,
    });
    if (error) {
      if (error.code === "42501") throw new AdminApiError(403, "Impostazioni riservate al Super Admin.");
      throw new AdminApiError(503, "Salvataggio promozioni non riuscito. Riprova tra poco.");
    }
    const saved = marketplacePromotionSettingsSchema.safeParse(data);
    if (!saved.success) throw new AdminApiError(503, "Conferma del salvataggio non disponibile. Ricarica le impostazioni.");
    return NextResponse.json({ settings: saved.data, storageReady: true, engineReady: before.engineReady, compensationEnabled: before.compensationEnabled }, { headers });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
