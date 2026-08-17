import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AdminApiError,
  adminApiErrorResponse,
  requireSuperAdmin,
} from "@/lib/admin/auth";
import { fetchTeamCompensationSettings } from "@/lib/team-compensation/settings";

const memberIdSchema = z.string().uuid();
const nullableCents = z.number().int().min(0).max(1_000_000).nullable();
const rulesSchema = z.object({
  leadVerificationEnabled: z.boolean(),
  primeFirstActivationEnabled: z.boolean(),
  primeRenewalEnabled: z.boolean(),
  primeLeadPurchaseEnabled: z.boolean(),
  leadVerificationCentsOverride: nullableCents,
  primeFirstActivationCentsOverride: nullableCents,
  primeRenewalCentsOverride: nullableCents,
  primeLeadPurchaseBasisPointsOverride: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .nullable(),
});

type RuleRow = {
  lead_verification_enabled: boolean;
  prime_first_activation_enabled: boolean;
  prime_renewal_enabled: boolean;
  prime_lead_purchase_enabled: boolean;
  lead_verification_cents_override: number | null;
  prime_first_activation_cents_override: number | null;
  prime_renewal_cents_override: number | null;
  prime_lead_purchase_basis_points_override: number | null;
};

const defaultRules = {
  leadVerificationEnabled: true,
  primeFirstActivationEnabled: false,
  primeRenewalEnabled: false,
  primeLeadPurchaseEnabled: false,
  leadVerificationCentsOverride: null,
  primeFirstActivationCentsOverride: null,
  primeRenewalCentsOverride: null,
  primeLeadPurchaseBasisPointsOverride: null,
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ memberId: string }> },
) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const memberId = memberIdSchema.parse((await context.params).memberId);
    await requireMember(supabase, memberId);

    const rulesTable = compensationRulesTable(supabase);
    const [{ data, error }, globalResult] = await Promise.all([
      rulesTable
        .select(ruleColumns)
        .eq("member_id", memberId)
        .maybeSingle(),
      fetchTeamCompensationSettings(supabase),
    ]);

    if (error) throw error;

    return NextResponse.json({
      rules: data ? mapRuleRow(data) : defaultRules,
      globalSettings: globalResult.settings,
      storageReady: globalResult.storageReady,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ memberId: string }> },
) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const memberId = memberIdSchema.parse((await context.params).memberId);
    const payload = rulesSchema.safeParse(await request.json());

    if (!payload.success) {
      throw new AdminApiError(422, "Regole compensi del membro non valide.");
    }

    await requireMember(supabase, memberId);
    const rulesTable = compensationRulesTable(supabase);
    const { data: before } = await rulesTable
      .select(ruleColumns)
      .eq("member_id", memberId)
      .maybeSingle();

    const { data, error } = await rulesTable
      .upsert(
        {
          member_id: memberId,
          lead_verification_enabled: payload.data.leadVerificationEnabled,
          prime_first_activation_enabled:
            payload.data.primeFirstActivationEnabled,
          prime_renewal_enabled: payload.data.primeRenewalEnabled,
          prime_lead_purchase_enabled: payload.data.primeLeadPurchaseEnabled,
          lead_verification_cents_override:
            payload.data.leadVerificationCentsOverride,
          prime_first_activation_cents_override:
            payload.data.primeFirstActivationCentsOverride,
          prime_renewal_cents_override:
            payload.data.primeRenewalCentsOverride,
          prime_lead_purchase_basis_points_override:
            payload.data.primeLeadPurchaseBasisPointsOverride,
          updated_by: profile.id,
        },
        { onConflict: "member_id" },
      )
      .select(ruleColumns)
      .single();

    if (error || !data) {
      throw error ?? new Error("Regole compensi del membro non salvate.");
    }

    const auditTable = supabase.from(
      "team_compensation_audit_logs" as never,
    ) as unknown as {
      insert: (row: Record<string, unknown>) => Promise<{
        error: { message?: string } | null;
      }>;
    };
    const { error: auditError } = await auditTable.insert({
      actor_profile_id: profile.id,
      action: "team_compensation.member_rules_updated",
      target_type: "team_member",
      target_id: memberId,
      before_data: before ? mapRuleRow(before) : null,
      after_data: mapRuleRow(data),
    });

    if (auditError) {
      console.error("Team compensation member rules audit failed", auditError);
    }

    return NextResponse.json({ rules: mapRuleRow(data) });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

type TeamSupabase = Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"];

async function requireMember(supabase: TeamSupabase, memberId: string) {
  const { data, error } = await supabase
    .from("team_members")
    .select("id")
    .eq("id", memberId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AdminApiError(404, "Membro Team non trovato.");
}

const ruleColumns =
  "lead_verification_enabled,prime_first_activation_enabled,prime_renewal_enabled,prime_lead_purchase_enabled,lead_verification_cents_override,prime_first_activation_cents_override,prime_renewal_cents_override,prime_lead_purchase_basis_points_override";

function compensationRulesTable(supabase: TeamSupabase) {
  return supabase.from("team_member_compensation_rules" as never) as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: RuleRow | null;
          error: { message?: string } | null;
        }>;
      };
    };
    upsert: (
      row: Record<string, unknown>,
      options: { onConflict: string },
    ) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: RuleRow | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
}

function mapRuleRow(row: RuleRow) {
  return {
    leadVerificationEnabled: row.lead_verification_enabled,
    primeFirstActivationEnabled: row.prime_first_activation_enabled,
    primeRenewalEnabled: row.prime_renewal_enabled,
    primeLeadPurchaseEnabled: row.prime_lead_purchase_enabled,
    leadVerificationCentsOverride: row.lead_verification_cents_override,
    primeFirstActivationCentsOverride:
      row.prime_first_activation_cents_override,
    primeRenewalCentsOverride: row.prime_renewal_cents_override,
    primeLeadPurchaseBasisPointsOverride:
      row.prime_lead_purchase_basis_points_override,
  };
}
