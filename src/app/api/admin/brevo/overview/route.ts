import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  BREVO_ATTRIBUTE_NAMES,
  getBrevoConfig,
} from "@/lib/brevo/config";
import { getEnv } from "@/lib/env";

const CONSENT_LIMIT = 250;
const OUTBOX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const [
      preferencesResult,
      snapshotsResult,
      outboxResult,
      pmCountResult,
    ] = await Promise.all([
      supabase
        .from("pm_marketing_preferences")
        .select(
          "profile_id,status,source,policy_version,granted_at,withdrawn_at,created_at,updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(CONSENT_LIMIT),
      supabase
        .from("pm_brevo_snapshots")
        .select("profile_id", { count: "exact", head: true }),
      supabase
        .from("brevo_outbox")
        .select(
          "id,profile_id,event_type,event_key,status,attempts,available_at,last_error,last_http_status,processed_at,created_at,updated_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .limit(OUTBOX_LIMIT),
      supabase
        .from("property_manager_profiles")
        .select("profile_id", { count: "exact", head: true }),
    ]);

    if (preferencesResult.error) throw preferencesResult.error;
    if (snapshotsResult.error) throw snapshotsResult.error;
    if (outboxResult.error) throw outboxResult.error;
    if (pmCountResult.error) throw pmCountResult.error;

    const [
      consentGrantedResult,
      consentNotGrantedResult,
      consentWithdrawnResult,
      outboxPendingResult,
      outboxRetryResult,
      outboxProcessingResult,
      outboxCompletedResult,
      outboxDeadLetterResult,
    ] = await Promise.all([
      supabase
        .from("pm_marketing_preferences")
        .select("profile_id", { count: "exact", head: true })
        .eq("status", "granted"),
      supabase
        .from("pm_marketing_preferences")
        .select("profile_id", { count: "exact", head: true })
        .eq("status", "not_granted"),
      supabase
        .from("pm_marketing_preferences")
        .select("profile_id", { count: "exact", head: true })
        .eq("status", "withdrawn"),
      supabase
        .from("brevo_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("brevo_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "retry"),
      supabase
        .from("brevo_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing"),
      supabase
        .from("brevo_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed"),
      supabase
        .from("brevo_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "dead_letter"),
    ]);
    const countErrors = [
      consentGrantedResult.error,
      consentNotGrantedResult.error,
      consentWithdrawnResult.error,
      outboxPendingResult.error,
      outboxRetryResult.error,
      outboxProcessingResult.error,
      outboxCompletedResult.error,
      outboxDeadLetterResult.error,
    ].filter(Boolean);

    if (countErrors.length > 0) throw countErrors[0];

    const preferences = preferencesResult.data ?? [];
    const profileIds = preferences.map((preference) => preference.profile_id);
    const profilesResult = profileIds.length
      ? await supabase
          .from("profiles")
          .select("id,email,first_name,last_name,status,created_at")
          .in("id", profileIds)
      : { data: [], error: null };

    if (profilesResult.error) throw profilesResult.error;

    const profilesById = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile]),
    );
    const consentRecords = preferences.map((preference) => {
      const profile = profilesById.get(preference.profile_id);

      return {
        profileId: preference.profile_id,
        email: profile?.email ?? "Profilo non disponibile",
        firstName: profile?.first_name ?? null,
        lastName: profile?.last_name ?? null,
        accountStatus: profile?.status ?? "unknown",
        registeredAt: profile?.created_at ?? null,
        consentStatus: preference.status,
        source: preference.source,
        policyVersion: preference.policy_version,
        grantedAt: preference.granted_at,
        withdrawnAt: preference.withdrawn_at,
        updatedAt: preference.updated_at,
      };
    });
    const outbox = outboxResult.data ?? [];
    const brevoConfig = getBrevoConfig();
    const rawListId = getEnv("BREVO_LIST_ID")?.trim() ?? "";
    const parsedListId = Number.parseInt(rawListId, 10);

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        environment: {
          enabled: brevoConfig.enabled,
          reason: brevoConfig.enabled ? null : brevoConfig.reason,
          apiKeyConfigured: Boolean(getEnv("BREVO_API_KEY")?.trim()),
          listIdConfigured:
            Number.isInteger(parsedListId) && parsedListId > 0,
          listId:
            Number.isInteger(parsedListId) && parsedListId > 0
              ? parsedListId
              : null,
          webhookSecretConfigured: Boolean(
            getEnv("BREVO_WEBHOOK_SECRET")?.trim(),
          ),
        },
        stats: {
          propertyManagers: pmCountResult.count ?? 0,
          consentGranted: consentGrantedResult.count ?? 0,
          consentNotGranted: consentNotGrantedResult.count ?? 0,
          consentWithdrawn: consentWithdrawnResult.count ?? 0,
          snapshots: snapshotsResult.count ?? 0,
          outboxTotal: outboxResult.count ?? 0,
          pending: outboxPendingResult.count ?? 0,
          retry: outboxRetryResult.count ?? 0,
          processing: outboxProcessingResult.count ?? 0,
          completed: outboxCompletedResult.count ?? 0,
          deadLetter: outboxDeadLetterResult.count ?? 0,
        },
        consentRecords,
        outbox,
        attributes: Object.values(BREVO_ATTRIBUTE_NAMES),
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
