import type { SupabaseClient } from "@supabase/supabase-js";
import { getBillingProfileCompleteness } from "@/lib/billing/completeness";
import type { Database } from "@/lib/supabase/database.types";

export async function getBillingReadiness(
  supabase: SupabaseClient<Database>,
  profileId: string,
) {
  const { data, error } = await supabase
    .from("billing_profiles")
    .select(
      "subject_type,first_name,last_name,fiscal_code,company_name,vat_number,address_line,postal_code,city,province,country,sdi_code,pec",
    )
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) throw error;

  return getBillingProfileCompleteness(data);
}

