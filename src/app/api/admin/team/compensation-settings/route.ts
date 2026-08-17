import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AdminApiError,
  adminApiErrorResponse,
  requireSuperAdmin,
} from "@/lib/admin/auth";
import {
  fetchTeamCompensationReadiness,
  fetchTeamCompensationSettings,
  saveTeamCompensationSettings,
  setTeamCompensationFeatureEnabled,
} from "@/lib/team-compensation/settings";

const settingsSchema = z.object({
  leadVerificationCents: z.number().int().min(0).max(1_000_000),
  primeFirstActivationCents: z.number().int().min(0).max(1_000_000),
  primeRenewalCents: z.number().int().min(0).max(1_000_000),
  primeLeadPurchaseBasisPoints: z.number().int().min(0).max(10_000),
});

const featureSchema = z.object({
  featureEnabled: z.boolean(),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const [result, readiness] = await Promise.all([
      fetchTeamCompensationSettings(supabase),
      fetchTeamCompensationReadiness(supabase),
    ]);
    return NextResponse.json({ ...result, readiness });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const body = await request.json();
    const featurePayload = featureSchema.safeParse(body);

    if (featurePayload.success) {
      const before = await fetchTeamCompensationSettings(supabase);
      if (!before.storageReady) {
        throw new AdminApiError(503, "Archivio compensi non disponibile.");
      }

      const readiness = await fetchTeamCompensationReadiness(supabase);
      if (!readiness) {
        throw new AdminApiError(
          503,
          "Controllo di attivazione non disponibile. Verifica la migration.",
        );
      }
      if (
        featurePayload.data.featureEnabled &&
        (readiness.activeMembers === 0 ||
          readiness.missingRules > 0 ||
          readiness.accountManagers !== readiness.accountManagersReady)
      ) {
        throw new AdminApiError(
          409,
          "Attivazione bloccata: completa le regole dei membri del Team.",
        );
      }

      const settings = await setTeamCompensationFeatureEnabled({
        supabase,
        profileId: profile.id,
        enabled: featurePayload.data.featureEnabled,
      });
      await writeSettingsAudit({
        supabase,
        profileId: profile.id,
        action: settings.featureEnabled
          ? "team_compensation.enabled"
          : "team_compensation.disabled",
        before: before.settings,
        after: settings,
        metadata: { readiness },
      });

      return NextResponse.json({ settings, storageReady: true, readiness });
    }

    const payload = settingsSchema.safeParse(body);

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

    await writeSettingsAudit({
      supabase,
      profileId: profile.id,
      action: "team_compensation.settings_updated",
      before: before.settings,
      after: settings,
      metadata: { feature_enabled_unchanged: true },
    });

    return NextResponse.json({ settings, storageReady: true });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function writeSettingsAudit({
  supabase,
  profileId,
  action,
  before,
  after,
  metadata,
}: {
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"];
  profileId: string;
  action: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  metadata: Record<string, unknown>;
}) {
  const auditTable = supabase.from(
    "team_compensation_audit_logs" as never,
  ) as unknown as {
    insert: (row: Record<string, unknown>) => Promise<{
      error: { message?: string } | null;
    }>;
  };
  const { error } = await auditTable.insert({
    actor_profile_id: profileId,
    action,
    target_type: "team_compensation_settings",
    target_id: "global",
    before_data: before,
    after_data: after,
    metadata,
  });

  if (error) console.error("Team compensation settings audit failed", error);
}
