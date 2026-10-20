import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { LeadOperationalActivity } from "@/lib/lead-operational-activity";

export async function fetchLeadActivities(supabase: SupabaseClient<Database>, ids: string[]) {
  const byRequest = new Map<string, LeadOperationalActivity>();
  if (!ids.length) return { available: true, byRequest };
  try {
    const result = await supabase.from("owner_request_operational_activity")
      .select("owner_request_id,last_activity_at,kind,source").in("owner_request_id", ids);
    if (result.error) {
      if (!["42P01", "PGRST205"].includes(result.error.code)) console.error("Lead activity lookup failed:", result.error.code);
      return { available: false, byRequest };
    }
    for (const row of result.data ?? []) byRequest.set(row.owner_request_id, { at: row.last_activity_at, kind: row.kind, source: row.source });
    return { available: true, byRequest };
  } catch (error) {
    console.error("Lead activity lookup unavailable:", error instanceof Error ? error.message : "unknown");
    return { available: false, byRequest };
  }
}
