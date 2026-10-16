import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireAdminPermission } from "@/lib/admin/auth";
import type { LeadAssignmentsSnapshot, LeadAssignee } from "@/lib/admin/lead-assignment-types";
import { readRowsInIdBatches } from "@/lib/supabase/batched-query";

const headers = { "Cache-Control": "private, no-store" };
const commandSchema = z.object({
  ownerRequestId: z.string().uuid(),
  assigneeProfileId: z.string().uuid().nullable(),
  expectedRevision: z.string().regex(/^(0|[1-9][0-9]{0,15})$/),
}).strict();

function missingSchema(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202";
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireAdminPermission(request, "leads", "read");
    const snapshot: LeadAssignmentsSnapshot = {
      storageReady: false, actorProfileId: profile.id, canManageAll: isSuperAdmin,
      candidates: [], assignments: [],
    };
    const rows = [];
    for (let from = 0; ; from += 500) {
      const result = await supabase.from("owner_request_assignments")
        .select("owner_request_id,assignee_profile_id,revision,assigned_at,owner_requests!inner(status)")
        .eq("owner_requests.status", "to_verify").order("owner_request_id").range(from, from + 499);
      if (missingSchema(result.error)) return NextResponse.json(snapshot, { headers });
      if (result.error) throw result.error;
      rows.push(...result.data ?? []);
      if ((result.data?.length ?? 0) < 500) break;
    }
    const candidates = await supabase.rpc("owner_request_assignment_candidates", { p_actor_profile_id: profile.id });
    if (missingSchema(candidates.error)) return NextResponse.json(snapshot, { headers });
    if (candidates.error) throw candidates.error;
    const ids = [...new Set(rows.map((row) => row.assignee_profile_id).filter((id): id is string => Boolean(id)))];
    const [profiles, members] = await Promise.all([
      readRowsInIdBatches(ids, (batch) => supabase.from("profiles").select("id,first_name,last_name").in("id", batch)),
      readRowsInIdBatches(ids, (batch) => supabase.from("team_members").select("profile_id,badge_color").in("profile_id", batch)),
    ]);
    const colors = new Map(members.map((member) => [member.profile_id, member.badge_color]));
    const assignees = new Map(profiles.map((person) => [person.id, {
      profileId: person.id, name: personName(person), badgeColor: colors.get(person.id) ?? null,
    } satisfies LeadAssignee]));
    snapshot.storageReady = true;
    snapshot.candidates = (candidates.data ?? []).map((person) => ({
      profileId: person.profile_id, name: personName(person), badgeColor: person.badge_color,
    }));
    snapshot.assignments = rows.map((row) => ({
      ownerRequestId: row.owner_request_id, revision: String(row.revision), assignedAt: row.assigned_at,
      assignee: row.assignee_profile_id ? assignees.get(row.assignee_profile_id)
        ?? { profileId: row.assignee_profile_id, name: "Membro non disponibile", badgeColor: null } : null,
    }));
    return NextResponse.json(snapshot, { headers });
  } catch (error) { return adminApiErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireAdminPermission(request, "leads", "write");
    const parsed = commandSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Presa in carico non valida. Ricarica la pipeline." }, { status: 422, headers });
    const command = parsed.data;
    const result = await supabase.rpc("set_owner_request_assignment", {
      p_owner_request_id: command.ownerRequestId, p_actor_profile_id: profile.id,
      p_assignee_profile_id: command.assigneeProfileId, p_expected_revision: command.expectedRevision,
    });
    if (missingSchema(result.error)) return NextResponse.json({ error: "Presa in carico non ancora disponibile: aggiornamento database richiesto." }, { status: 503, headers });
    if (result.error) throw result.error;
    const outcome = result.data && typeof result.data === "object" && !Array.isArray(result.data) ? result.data.status : null;
    if (outcome === "saved" || outcome === "unchanged") return NextResponse.json({ ok: true }, { headers });
    const failures: Record<string, [number, string]> = {
      forbidden: [403, "Non puoi modificare questa presa in carico."],
      invalid_assignee: [409, "Il membro scelto non e piu disponibile per la lavorazione dei lead."],
      not_found: [404, "Lead non trovato."],
      unavailable: [409, "Il lead non e piu nella pipeline Nuovi Lead."],
      occupied: [409, "Il lead e gia preso in carico da un collega. La card verra aggiornata."],
      conflict: [409, "La presa in carico e appena cambiata. La card verra aggiornata: controllala prima di riprovare."],
    };
    const failure = typeof outcome === "string" ? failures[outcome] : undefined;
    if (!failure) throw new Error("Unexpected lead assignment outcome");
    return NextResponse.json({ error: failure[1] }, { status: failure[0], headers });
  } catch (error) { return adminApiErrorResponse(error); }
}

function personName(person: { first_name: string | null; last_name: string | null }) {
  return [person.first_name, person.last_name].filter(Boolean).join(" ").trim() || "Membro del team";
}
