import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AdminApiError, adminApiErrorResponse, requireTeamCalendarAccess } from "@/lib/admin/auth";
import { calendarEntriesOverlap, calendarEntrySchema, type CalendarEntry } from "@/lib/team-calendar";
import { canManageCalendarEntry } from "@/lib/team-calendar-access";

const mutation = z.object({ entry: calendarEntrySchema, allowOverlap: z.boolean().optional(), id: z.string().uuid().optional(), updatedAt: z.string().datetime({ offset: true }).optional() }).strict();
const deletion = z.object({ id: z.string().uuid(), updatedAt: z.string().datetime({ offset: true }) }).strict();
const noStore = { "Cache-Control": "private, no-store" };

async function authorize(request: NextRequest) {
  return requireTeamCalendarAccess(request);
}

function assertOwner(context: Awaited<ReturnType<typeof authorize>>, memberId: string) {
  if (!canManageCalendarEntry({ isSuperAdmin: context.isSuperAdmin, memberId: context.teamMemberId }, memberId)) {
    throw new AdminApiError(403, "Puoi gestire soltanto i tuoi eventi.");
  }
}

async function checkExistingOwner(context: Awaited<ReturnType<typeof authorize>>, id: string) {
  const existing = await context.supabase.from("team_calendar_entries").select("member_id").eq("id", id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) throw new AdminApiError(404, "Evento non trovato.");
  assertOwner(context, existing.data.member_id);
}

async function readEntries(supabase: Awaited<ReturnType<typeof authorize>>["supabase"], memberId?: string) {
  const data: CalendarEntry[] = [];
  // Page below the PostgREST row cap; never silently truncate a calendar.
  for (let offset = 0; offset <= 5000; offset += 500) {
    let query = supabase.from("team_calendar_entries").select("id,member_id,kind,start_date,end_date,all_day,start_time,end_time,repeats_weekly,repeat_until,note,updated_at").order("id").range(offset, offset + 499);
    if (memberId) query = query.eq("member_id", memberId);
    const result = await query;
    if (result.error) return { data: null, error: result.error };
    data.push(...result.data);
    if (data.length > 5000) throw new AdminApiError(422, "Il calendario supera il limite di consultazione. Contatta l'amministratore.");
    if (result.data.length < 500) return { data, error: null };
  }
  return { data, error: null };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, isSuperAdmin, teamMemberId } = await authorize(request);
    const members = await supabase.from("team_members").select("id,profile_id,badge_color,status").order("created_at");
    if (members.error) throw members.error;
    const ids = (members.data ?? []).map((m) => m.profile_id);
    const profiles = ids.length ? await supabase.from("profiles").select("id,first_name,last_name").in("id", ids) : { data: [], error: null };
    if (profiles.error) throw profiles.error;
    const entries = await readEntries(supabase);
    const ready = !entries.error || !["42P01", "PGRST205"].includes(entries.error.code);
    if (entries.error && ready) throw entries.error;
    if ((entries.data?.length ?? 0) > 5000) throw new AdminApiError(422, "Il calendario supera il limite di consultazione. Contatta l'amministratore.");
    return NextResponse.json({ storageReady: ready, viewer: { isSuperAdmin, memberId: teamMemberId }, entries: entries.data ?? [], members: (members.data ?? []).map((m) => {
      const p = profiles.data?.find((p) => p.id === m.profile_id);
      return { id: m.id, name: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Membro del team", color: /^#[0-9a-f]{6}$/i.test(m.badge_color ?? "") ? m.badge_color : "#008568", active: m.status === "active" };
    }) }, { headers: noStore });
  } catch (error) { return adminApiErrorResponse(error); }
}

async function save(request: NextRequest, updating: boolean) {
  try {
    const context = await authorize(request);
    const { supabase, profile } = context;
    const parsed = mutation.safeParse(await request.json());
    if (!parsed.success) throw new AdminApiError(400, parsed.error.issues[0]?.message ?? "Dati non validi.");
    const { entry, id, updatedAt, allowOverlap } = parsed.data;
    if (updating && (!id || !updatedAt)) throw new AdminApiError(400, "Ricarica l'evento prima di modificarlo.");
    assertOwner(context, entry.member_id);
    if (updating) await checkExistingOwner(context, id!);
    const member = await supabase.from("team_members").select("id,status").eq("id", entry.member_id).maybeSingle();
    if (member.error) throw member.error;
    if (!member.data || member.data.status !== "active") throw new AdminApiError(400, "Seleziona un membro attivo.");
    const siblings = await readEntries(supabase, entry.member_id);
    if (siblings.error) throw siblings.error;
    if ((siblings.data?.length ?? 0) > 5000) throw new AdminApiError(422, "Troppi eventi per questo membro.");
    const overlaps = (siblings.data ?? []).filter((other) => other.id !== id && calendarEntriesOverlap({ ...entry, id: id ?? "new", updated_at: "" }, other as CalendarEntry));
    if (overlaps.length && !allowOverlap) return NextResponse.json({ error: "Il membro ha gia eventi in questo intervallo. Confermi la sovrapposizione? Le assenze prevalgono sulle disponibilita.", overlap: true }, { status: 409, headers: noStore });
    const values = { ...entry, updated_by: profile.id, updated_at: new Date().toISOString() };
    let update = supabase.from("team_calendar_entries").update(values).eq("id", id ?? "").eq("updated_at", updatedAt ?? "");
    // Keep ownership in the write itself, including concurrent admin reassignments.
    if (!context.isSuperAdmin) update = update.eq("member_id", context.teamMemberId!);
    const result = updating
      ? await update.select("id").maybeSingle()
      : await supabase.from("team_calendar_entries").insert({ ...values, created_by: profile.id }).select("id").single();
    if (result.error) throw result.error;
    if (!result.data) throw new AdminApiError(409, "Evento modificato da un altro amministratore. Ricarica il calendario.");
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) { return adminApiErrorResponse(error); }
}
export function POST(request: NextRequest) { return save(request, false); }
export function PATCH(request: NextRequest) { return save(request, true); }
export async function DELETE(request: NextRequest) {
  try {
    const context = await authorize(request);
    const { supabase } = context;
    const parsed = deletion.safeParse(await request.json());
    if (!parsed.success) throw new AdminApiError(400, "Evento non valido.");
    await checkExistingOwner(context, parsed.data.id);
    let query = supabase.from("team_calendar_entries").delete().eq("id", parsed.data.id).eq("updated_at", parsed.data.updatedAt);
    if (!context.isSuperAdmin) query = query.eq("member_id", context.teamMemberId!);
    const result = await query.select("id").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new AdminApiError(409, "Evento gia modificato o eliminato. Ricarica il calendario.");
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) { return adminApiErrorResponse(error); }
}
