import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { formatCurrencyCents } from "@/lib/auth/roles";

export async function fetchPromotionSaleSummary(supabase: SupabaseClient<Database>, purchaseId: string) {
  const empty = { promotion_member_name: "", promotion_compensation: "", promotion_details: "" };
  try {
    const table = supabase.from("marketplace_lead_promotion_sales" as never) as unknown as {
      select: (columns: string) => { eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: { member_id: string; amount_cents: number } | null; error: unknown }>;
      } };
    };
    const sale = await table.select("member_id,amount_cents").eq("purchase_id", purchaseId).maybeSingle();
    if (sale.error || !sale.data) return empty;
    const member = await supabase.from("team_members").select("profile_id").eq("id", sale.data.member_id).maybeSingle();
    if (member.error || !member.data) return empty;
    const person = await supabase.from("profiles").select("first_name,last_name").eq("id", member.data.profile_id).maybeSingle();
    if (person.error || !person.data) return empty;
    const name = [person.data.first_name, person.data.last_name].filter(Boolean).join(" ").trim() || "Membro del team";
    return { promotion_member_name: name, promotion_compensation: formatCurrencyCents(sale.data.amount_cents),
      promotion_details: `Promozione assegnata a: ${name}` };
  } catch {
    // Optional enrichment must never prevent the existing administrator notification.
    return empty;
  }
}
