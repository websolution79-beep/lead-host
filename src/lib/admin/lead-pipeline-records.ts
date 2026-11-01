import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AdminLeadRecord } from "@/lib/admin/lead-records";
import { fetchLeadActivities } from "@/lib/admin/lead-activity-records";

export type LeadPipelineStage = { id: string; name: string; color: string; position: number };
export type LeadPipelineRecord = Pick<AdminLeadRecord,
  "ownerRequestId" | "createdAt" | "requestStatus" | "qualificationNotes" |
  "reviewPipelineStageId" | "firstWorkedBy" | "operationalActivity"> & {
  summaryOnly: true;
  contact: Pick<NonNullable<AdminLeadRecord["contact"]>, "firstName" | "lastName" | "email" | "phone"> | null;
  property: Pick<NonNullable<AdminLeadRecord["property"]>, "propertyType" | "city" | "province" | "region" | "description"> | null;
  lead: Pick<NonNullable<AdminLeadRecord["lead"]>, "id" | "title" | "publishedAt"> | null;
};

export async function fetchAdminLeadPipeline(db: SupabaseClient<Database>) {
  const requests = [];
  // Page internally to avoid PostgREST's row cap, never truncate the board.
  for (let from = 0; ; from += 100) {
    const result = await db.from("owner_requests")
      .select("id,created_at,status,qualification_notes,review_pipeline_stage_id,first_worked_by_profile_id")
      .eq("status", "to_verify").order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(from, from + 99);
    if (result.error) throw result.error;
    requests.push(...result.data ?? []);
    if ((result.data?.length ?? 0) < 100) break;
  }
  const workerIds = [...new Set(requests.flatMap(r => r.first_worked_by_profile_id ? [r.first_worked_by_profile_id] : []))];
  const [stages, profiles, members] = await Promise.all([
    db.from("admin_lead_pipeline_stages").select("id,name,color,position")
      .order("position", { ascending: true }).order("created_at", { ascending: true }),
    workerIds.length ? db.from("profiles").select("id,first_name,last_name").in("id", workerIds) : Promise.resolve({ data: [], error: null }),
    workerIds.length ? db.from("team_members").select("profile_id,badge_color").in("profile_id", workerIds) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [stages, profiles, members]) if (result.error) throw result.error;
  const profilesById = new Map(profiles.data?.map(p => [p.id, p]));
  const colors = new Map(members.data?.map(m => [m.profile_id, m.badge_color]));
  const records: LeadPipelineRecord[] = [];
  for (let offset = 0; offset < requests.length; offset += 100) {
    const batch = requests.slice(offset, offset + 100), ids = batch.map(r => r.id);
    const [contacts, properties, leads, activities] = await Promise.all([
      db.from("owner_contacts").select("owner_request_id,first_name,last_name,email,phone").in("owner_request_id", ids),
      db.from("properties").select("owner_request_id,property_type,city,province,region,description").in("owner_request_id", ids),
      db.from("leads").select("owner_request_id,id,title,published_at").in("owner_request_id", ids),
      fetchLeadActivities(db, ids),
    ]);
    for (const result of [contacts, properties, leads]) if (result.error) throw result.error;
    const contactsById = new Map(contacts.data?.map(c => [c.owner_request_id, c]));
    const propertiesById = new Map(properties.data?.map(p => [p.owner_request_id, p]));
    const leadsById = new Map(leads.data?.map(l => [l.owner_request_id, l]));
    for (const r of batch) {
      const c = contactsById.get(r.id), p = propertiesById.get(r.id), l = leadsById.get(r.id);
      const worker = r.first_worked_by_profile_id ? profilesById.get(r.first_worked_by_profile_id) : null;
      records.push({ summaryOnly: true, ownerRequestId: r.id, createdAt: r.created_at, requestStatus: r.status,
        qualificationNotes: r.qualification_notes, reviewPipelineStageId: r.review_pipeline_stage_id,
        operationalActivity: activities.available ? activities.byRequest.get(r.id) ?? null : undefined,
        firstWorkedBy: worker ? { profileId: worker.id, firstName: worker.first_name, lastName: worker.last_name, badgeColor: colors.get(worker.id) ?? null } : null,
        contact: c ? { firstName: c.first_name, lastName: c.last_name, email: c.email, phone: c.phone } : null,
        property: p ? { propertyType: p.property_type, city: p.city, province: p.province, region: p.region, description: p.description } : null,
        lead: l ? { id: l.id, title: l.title, publishedAt: l.published_at } : null,
      });
    }
  }
  return { records, stages: stages.data ?? [] };
}
