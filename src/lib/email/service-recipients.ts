import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { readRowsInIdBatches } from "@/lib/supabase/batched-query";

export async function countEligibleServiceEmailRecipients(
  supabase: SupabaseClient<Database>,
) {
  const profileIds = new Set<string>();
  const pageSize = 500;

  // Page the source too: PostgREST limits rows even without an explicit limit.
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("property_manager_profiles")
      .select("profile_id")
      .neq("verification_status", "suspended")
      .order("profile_id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data ?? []) profileIds.add(row.profile_id);
    if ((data?.length ?? 0) < pageSize) break;
  }

  const profiles = await readRowsInIdBatches<{ id: string }>(
    [...profileIds],
    (batch) => supabase
      .from("profiles")
      .select("id")
      .in("id", batch)
      .eq("status", "active"),
  );
  return profiles.length;
}
