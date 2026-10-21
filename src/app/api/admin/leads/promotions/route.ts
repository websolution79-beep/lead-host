import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireAdminPermission } from "@/lib/admin/auth";
import { marketplacePromotionEngineReady } from "@/lib/team-compensation/marketplace-promotion-config";
import { fetchMarketplacePromotionSettings } from "@/lib/team-compensation/marketplace-promotion-settings";
import type { MarketplacePromotionsSnapshot, PromotionMember } from "@/lib/team-compensation/marketplace-promotion-types";
import { readRowsInIdBatches } from "@/lib/supabase/batched-query";

const headers = { "Cache-Control": "private, no-store" };
const idsSchema = z.array(z.string().uuid()).min(1).max(100);
const commandSchema = z.object({
  leadId: z.string().uuid(),
  expectedRevision: z.string().regex(/^(0|[1-9][0-9]{0,15})$/),
  action: z.enum(["claim", "release"]),
  memberId: z.string().uuid().optional(),
}).strict();

type PromotionRow = {
  lead_id: string; member_id: string; revision: number | string;
  state: "assigned" | "released" | "converted"; publication_at: string;
};
function missingSchema(error: { code?: string } | null) {
  return Boolean(error?.code && ["42P01", "42703", "PGRST205", "PGRST202", "PGRST204"].includes(error.code));
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireAdminPermission(request, "leads", "read");
    const parsed = idsSchema.safeParse(request.nextUrl.searchParams.get("leadIds")?.split(","));
    if (!parsed.success) return NextResponse.json({ error: "Selezione lead non valida (massimo 100)." }, { status: 422, headers });
    const ids = [...new Set(parsed.data)];
    const now = Date.now();
    const snapshot: MarketplacePromotionsSnapshot = {
      storageReady: false, engineReady: marketplacePromotionEngineReady, enabled: false,
      canManageAll: isSuperAdmin, serverNow: new Date(now).toISOString(), candidates: [], promotions: [],
    };
    const config = await fetchMarketplacePromotionSettings(supabase);
    if (!config.storageReady) return NextResponse.json(snapshot, { headers });
    snapshot.engineReady = config.engineReady;
    const promotionsTable = supabase.from("marketplace_lead_promotions" as never) as unknown as {
      select: (columns: string) => { in: (column: string, ids: string[]) => Promise<{ data: PromotionRow[] | null; error: { code?: string } | null }> };
    };
    const result = await promotionsTable.select("lead_id,member_id,revision,state,publication_at").in("lead_id", ids);
    if (missingSchema(result.error)) return NextResponse.json(snapshot, { headers });
    if (result.error) throw result.error;
    const leads = await supabase.from("leads").select("id,visibility_mode,published_at,internal_status,public_status,exclusive_purchase_id,shared_slots_sold,expires_at,visible_until,created_at").in("id", ids);
    if (leads.error) throw leads.error;
    const candidates = await supabase.rpc("owner_request_assignment_candidates", { p_actor_profile_id: profile.id });
    if (missingSchema(candidates.error)) return NextResponse.json(snapshot, { headers });
    if (candidates.error) throw candidates.error;
    const candidateProfiles = new Map((candidates.data ?? []).map((person) => [person.profile_id, person]));
    const profileIds = [...candidateProfiles.keys()];
    const candidateMembers = await readRowsInIdBatches(profileIds, (batch) => supabase.from("team_members").select("id,profile_id,badge_color,status").in("profile_id", batch).eq("status", "active"));
    const memberIds = [...new Set((result.data ?? []).map((row) => row.member_id))];
    const assignedMembers = await readRowsInIdBatches(memberIds, (batch) => supabase.from("team_members").select("id,profile_id,badge_color").in("id", batch));
    const assignedProfiles = await readRowsInIdBatches(assignedMembers.map((member) => member.profile_id), (batch) => supabase.from("profiles").select("id,first_name,last_name").in("id", batch));
    const names = new Map(assignedProfiles.map((person) => [person.id, name(person)]));
    const promoters = new Map(assignedMembers.map((member) => [member.id, {
      memberId: member.id, name: names.get(member.profile_id) ?? "Membro non disponibile", badgeColor: member.badge_color,
    } satisfies PromotionMember]));
    const rows = new Map((result.data ?? []).map((row) => [row.lead_id, row]));
    snapshot.candidates = candidateMembers.map((member) => ({
      memberId: member.id, name: name(candidateProfiles.get(member.profile_id)!), badgeColor: member.badge_color,
    }));
    snapshot.storageReady = true;
    snapshot.enabled = config.settings.enabled && config.compensationEnabled;
    snapshot.promotions = (leads.data ?? []).map((lead) => {
      const row = rows.get(lead.id);
      const samePublication = Boolean(row && lead.published_at && Date.parse(row.publication_at) === Date.parse(lead.published_at));
      const current = row && (samePublication || row.state === "converted") ? row : null;
      const expires = Date.parse(lead.expires_at ?? lead.visible_until ?? lead.created_at);
      return {
        leadId: lead.id, revision: String(row?.revision ?? "0"), state: current?.state ?? null,
        promoter: current && current.state !== "released" ? promoters.get(current.member_id) ?? { memberId: current.member_id, name: "Membro non disponibile", badgeColor: null } : null,
        availableAt: lead.published_at ? new Date(Date.parse(lead.published_at) + config.settings.waitMinutes * 60_000).toISOString() : null,
        eligible: lead.visibility_mode === "public" && Boolean(lead.published_at)
          && ["available", "one_slot_sold"].includes(lead.internal_status)
          && ["available", "last_availability"].includes(lead.public_status)
          && !lead.exclusive_purchase_id && lead.shared_slots_sold < 2 && expires > now
          && row?.state !== "converted",
      };
    });
    return NextResponse.json(snapshot, { headers });
  } catch (error) { return adminApiErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireAdminPermission(request, "leads", "write");
    const parsed = commandSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Comando promozione non valido." }, { status: 422, headers });
    if (parsed.data.action === "release" && (!isSuperAdmin || parsed.data.memberId)) {
      return NextResponse.json({ error: "Rilascio riservato al Super Admin." }, { status: 403, headers });
    }
    if (parsed.data.action === "claim" && !marketplacePromotionEngineReady) {
      return NextResponse.json({ error: "Promozione non ancora attivabile: verifica compensi e rimborsi in corso." }, { status: 409, headers });
    }
    if (parsed.data.action === "claim") {
      const config = await fetchMarketplacePromotionSettings(supabase);
      if (!config.storageReady || !config.engineReady) return NextResponse.json({ error: "Archivio compensi promozione non pronto." }, { status: 503, headers });
      if (!config.settings.enabled || !config.compensationEnabled) return NextResponse.json({ error: "Promozione lead o motore compensi disattivati." }, { status: 409, headers });
    }
    const rpc = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: { status?: string } | null; error: { code?: string } | null }> };
    const result = await rpc.rpc("set_marketplace_lead_promotion", {
      p_lead_id: parsed.data.leadId, p_actor_profile_id: profile.id,
      p_expected_revision: parsed.data.expectedRevision, p_action: parsed.data.action,
      p_member_id: parsed.data.memberId ?? null,
    });
    if (missingSchema(result.error)) return NextResponse.json({ error: "Archivio promozioni non disponibile." }, { status: 503, headers });
    if (result.error) throw result.error;
    const status = result.data?.status;
    if (status === "saved" || status === "unchanged") return NextResponse.json({ ok: true }, { headers });
    const failures: Record<string, [number, string]> = {
      forbidden: [403, "Non puoi modificare questa promozione."],
      invalid_command: [422, "Comando promozione non valido."],
      not_found: [404, "Lead o promozione non trovati."],
      conflict: [409, "Assegnazione appena cambiata. Controlla la riga aggiornata prima di riprovare."],
      already_converted: [409, "Il lead ha gia generato il compenso di vendita."],
      disabled: [409, "Promozione lead disattivata."],
      unavailable: [409, "Il lead non e piu disponibile nel Marketplace pubblico."],
      waiting: [409, "Non e ancora trascorso il tempo di attesa."],
      invalid_member: [403, "Membro non autorizzato alla promozione."],
      occupied: [409, "Il lead e gia promosso da un collega."],
    };
    const failure = status ? failures[status] : null;
    if (!failure) throw new Error("Unexpected promotion outcome");
    return NextResponse.json({ error: failure[1] }, { status: failure[0], headers });
  } catch (error) { return adminApiErrorResponse(error); }
}

function name(person: { first_name: string | null; last_name: string | null }) {
  return [person.first_name, person.last_name].filter(Boolean).join(" ").trim() || "Membro del team";
}
