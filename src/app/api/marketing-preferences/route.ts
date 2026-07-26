import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import {
  MARKETING_CONSENT_POLICY_VERSION,
} from "@/lib/brevo/config";
import { runBrevoWorkerSafely } from "@/lib/brevo/worker";

const updateSchema = z.object({
  enabled: z.boolean(),
});

type MarketingPreferenceRow = {
  status: "granted" | "not_granted" | "withdrawn";
  source: string;
  policy_version: string;
  granted_at: string | null;
  withdrawn_at: string | null;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const table = supabase.from("pm_marketing_preferences" as never) as unknown as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: MarketingPreferenceRow | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
    const { data, error } = await table
      .select("status,source,policy_version,granted_at,withdrawn_at,updated_at")
      .eq("profile_id", profile.id)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      preference: data ?? {
        status: "not_granted",
        source: "legacy_default",
        policy_version: MARKETING_CONSENT_POLICY_VERSION,
        granted_at: null,
        withdrawn_at: null,
        updated_at: profile.created_at,
      },
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const payload = updateSchema.parse(await request.json());
    const status = payload.enabled ? "granted" : "withdrawn";
    const rpc = supabase as unknown as {
      rpc: (
        fn: "record_pm_marketing_consent",
        args: Record<string, unknown>,
      ) => {
        single: () => Promise<{
          data: MarketingPreferenceRow | null;
          error: { message?: string } | null;
        }>;
      };
    };
    const { data, error } = await rpc
      .rpc("record_pm_marketing_consent", {
        p_profile_id: profile.id,
        p_status: status,
        p_source: "pm_profile_explicit",
        p_policy_version: MARKETING_CONSENT_POLICY_VERSION,
        p_evidence: {
          route: "/app/profilo",
          explicit_action: true,
          user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
        },
        p_external_event_id: null,
      })
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Consenso marketing non aggiornato.");
    }

    after(() => runBrevoWorkerSafely(10));

    return NextResponse.json({
      ok: true,
      preference: data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Preferenza marketing non valida." },
        { status: 400 },
      );
    }

    return propertyManagerApiErrorResponse(error);
  }
}
