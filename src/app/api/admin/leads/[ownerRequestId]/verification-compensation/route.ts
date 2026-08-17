import { NextResponse, type NextRequest } from "next/server";
import {
  AdminApiError,
  adminApiErrorResponse,
  requireAdminPermission,
} from "@/lib/admin/auth";
import { fetchTeamCompensationSettings } from "@/lib/team-compensation/settings";

type ClaimRow = {
  member_id: string;
  compensation_event_id: string;
  status: string;
  confirmed_at: string;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ownerRequestId: string }> },
) {
  try {
    const admin = await requireAdminPermission(request, "leads", "write");
    const ownerRequestId = (await context.params).ownerRequestId;
    const { supabase, teamMemberId } = admin;
    const settingsResult = await fetchTeamCompensationSettings(supabase);

    const [{ data: ownerRequest, error: requestError }, claimResult] =
      await Promise.all([
        supabase
          .from("owner_requests")
          .select("id,status,review_pipeline_stage_id")
          .eq("id", ownerRequestId)
          .maybeSingle(),
        compensationClaimsTable(supabase)
          .select("member_id,compensation_event_id,status,confirmed_at")
          .eq("owner_request_id", ownerRequestId)
          .maybeSingle(),
      ]);

    if (requestError) throw requestError;
    if (!ownerRequest) throw new AdminApiError(404, "Lead non trovato.");
    if (claimResult.error) throw claimResult.error;

    const claim = claimResult.data;
    const [stageResult, claimantResult] = await Promise.all([
      ownerRequest.review_pipeline_stage_id
        ? supabase
            .from("admin_lead_pipeline_stages")
            .select("name")
            .eq("id", ownerRequest.review_pipeline_stage_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      claim ? getClaimant(supabase, claim.member_id) : Promise.resolve(null),
    ]);

    if (stageResult.error) throw stageResult.error;
    const interested = stageResult.data?.name.trim().toLowerCase() === "interessato";
    const ownClaim = Boolean(
      claim && teamMemberId && claim.member_id === teamMemberId,
    );

    return NextResponse.json({
      featureEnabled: settingsResult.settings.featureEnabled,
      eligible: Boolean(
        settingsResult.settings.featureEnabled &&
          teamMemberId &&
          ownerRequest.status === "to_verify" &&
          interested &&
          !claim,
      ),
      interested,
      claimed: Boolean(claim && claim.status === "confirmed"),
      ownClaim,
      claimedAt: claim?.confirmed_at ?? null,
      claimantName: claimantResult?.name ?? null,
      reason: eligibilityReason({
        featureEnabled: settingsResult.settings.featureEnabled,
        hasTeamMember: Boolean(teamMemberId),
        isNewLead: ownerRequest.status === "to_verify",
        interested,
        claimed: Boolean(claim),
      }),
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ownerRequestId: string }> },
) {
  try {
    const { supabase, profile, teamMemberId } = await requireAdminPermission(
      request,
      "leads",
      "write",
    );
    const ownerRequestId = (await context.params).ownerRequestId;

    if (!teamMemberId) {
      throw new AdminApiError(
        422,
        "La conferma deve essere eseguita dal membro Team che ha verificato il Lead.",
      );
    }

    const rpcClient = supabase as unknown as {
      rpc: (
        name: string,
        params: Record<string, string>,
      ) => Promise<{ data: string | null; error: { message?: string } | null }>;
    };
    const { data: eventId, error } = await rpcClient.rpc(
      "claim_team_lead_verification_compensation",
      {
        p_owner_request_id: ownerRequestId,
        p_member_id: teamMemberId,
        p_actor_profile_id: profile.id,
      },
    );

    if (error || !eventId) {
      throw friendlyClaimError(error?.message);
    }

    return NextResponse.json({ ok: true, eventId });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

type AdminSupabase = Awaited<ReturnType<typeof requireAdminPermission>>["supabase"];

function compensationClaimsTable(supabase: AdminSupabase) {
  return supabase.from("team_lead_verification_claims" as never) as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: ClaimRow | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
}

async function getClaimant(supabase: AdminSupabase, memberId: string) {
  const { data: member, error } = await supabase
    .from("team_members")
    .select("profile_id")
    .eq("id", memberId)
    .maybeSingle();
  if (error) throw error;
  if (!member) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("first_name,last_name")
    .eq("id", member.profile_id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return null;

  return {
    name:
      `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
      "Membro Team",
  };
}

function eligibilityReason(input: {
  featureEnabled: boolean;
  hasTeamMember: boolean;
  isNewLead: boolean;
  interested: boolean;
  claimed: boolean;
}) {
  if (!input.featureEnabled) return "Motore compensi non ancora attivo.";
  if (input.claimed) return "Verifica già confermata.";
  if (!input.hasTeamMember) return "Conferma disponibile ai membri Team.";
  if (!input.isNewLead) return "Il Lead non è più nello stato Nuovi Lead.";
  if (!input.interested) return "Sposta prima il Lead nella colonna Interessato.";
  return null;
}

function friendlyClaimError(message?: string) {
  if (message?.includes("team_compensation_disabled")) {
    return new AdminApiError(409, "Il motore compensi non è ancora attivo.");
  }
  if (message?.includes("owner_request_not_interested")) {
    return new AdminApiError(409, "Sposta prima il Lead nella colonna Interessato.");
  }
  if (message?.includes("lead_verification_already_claimed")) {
    return new AdminApiError(409, "La verifica è già stata attribuita a un altro membro.");
  }
  if (message?.includes("lead_verification_compensation_not_enabled")) {
    return new AdminApiError(403, "Questo compenso non è abilitato per il tuo account.");
  }
  if (message?.includes("lead_verification_compensation_rate_zero")) {
    return new AdminApiError(409, "Il compenso configurato deve essere maggiore di zero.");
  }
  if (message?.includes("owner_request_not_new_lead")) {
    return new AdminApiError(409, "Il Lead non è più nello stato Nuovi Lead.");
  }
  return new Error(message ?? "Conferma verifica Lead non riuscita.");
}
