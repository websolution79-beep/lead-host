import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AdminApiError,
  adminApiErrorResponse,
  requireSuperAdmin,
} from "@/lib/admin/auth";
import {
  fetchTeamCompensationSettings,
  saveTeamCompensationSettings,
} from "@/lib/team-compensation/settings";

const settingsSchema = z.object({
  leadVerificationCents: z.number().int().min(0).max(1_000_000),
  primeFirstActivationCents: z.number().int().min(0).max(1_000_000),
  primeRenewalCents: z.number().int().min(0).max(1_000_000),
  primeLeadPurchaseBasisPoints: z.number().int().min(0).max(10_000),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const result = await fetchTeamCompensationSettings(supabase);
    return NextResponse.json(result);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = settingsSchema.safeParse(await request.json());

    if (!payload.success) {
      throw new AdminApiError(422, "Valori dei compensi non validi.");
    }

    const before = await fetchTeamCompensationSettings(supabase);
    if (!before.storageReady) {
      throw new AdminApiError(
        503,
        "Archivio compensi non disponibile. Verifica la migration.",
      );
    }

    const settings = await saveTeamCompensationSettings({
      supabase,
      profileId: profile.id,
      settings: payload.data,
    });

    const auditTable = supabase.from(
      "team_compensation_audit_logs" as never,
    ) as unknown as {
      insert: (row: Record<string, unknown>) => Promise<{
        error: { message?: string } | null;
      }>;
    };
    const { error: auditError } = await auditTable.insert({
      actor_profile_id: profile.id,
      action: "team_compensation.settings_updated",
      target_type: "team_compensation_settings",
      target_id: "global",
      before_data: before.settings,
      after_data: settings,
      metadata: { feature_enabled_unchanged: true },
    });

    if (auditError) {
      console.error("Team compensation settings audit failed", auditError);
    }

    return NextResponse.json({ settings, storageReady: true });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
