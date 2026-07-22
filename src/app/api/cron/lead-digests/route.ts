import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { sendLeadDigest } from "@/lib/email/notifications";

type PreferenceRow = {
  profile_id: string;
  new_lead_frequency: "daily" | "every_3_days";
  last_lead_digest_sent_at: string | null;
};

type PropertyManagerRow = {
  id: string;
  profile_id: string;
};

type ProfileRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
};

type LeadRow = {
  id: string;
  property_id: string;
  title: string;
  shared_price_cents: number;
  exclusive_price_cents: number;
  published_at: string | null;
};

type PropertyRow = {
  id: string;
  city: string | null;
  province: string | null;
};

export async function GET(request: NextRequest) {
  const cronSecret = getEnv("CRON_SECRET");
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const preferencesTable = supabase.from("email_preferences" as never) as unknown as {
    select: (columns: string) => {
      in: (
        column: string,
        values: string[],
      ) => Promise<{ data: PreferenceRow[] | null; error: { message?: string } | null }>;
    };
    update: (row: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
    };
  };
  const { data: preferences, error: preferencesError } = await preferencesTable
    .select("profile_id,new_lead_frequency,last_lead_digest_sent_at")
    .in("new_lead_frequency", ["daily", "every_3_days"]);

  if (preferencesError) {
    return NextResponse.json(
      { error: "Preferenze email non disponibili.", details: preferencesError.message },
      { status: 500 },
    );
  }

  const duePreferences = (preferences ?? []).filter(isDigestDue);

  if (!duePreferences.length) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const profileIds = duePreferences.map((item) => item.profile_id);
  const [{ data: profiles }, { data: propertyManagers }, { data: leads }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id,email,first_name,last_name,status")
        .in("id", profileIds)
        .eq("status", "active"),
      supabase
        .from("property_manager_profiles")
        .select("id,profile_id")
        .in("profile_id", profileIds)
        .neq("verification_status", "suspended"),
      supabase
        .from("leads")
        .select("id,property_id,title,shared_price_cents,exclusive_price_cents,published_at")
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(40),
    ]);

  const profileById = new Map(((profiles ?? []) as ProfileRow[]).map((item) => [item.id, item]));
  const pmByProfileId = new Map(
    ((propertyManagers ?? []) as PropertyManagerRow[]).map((item) => [item.profile_id, item]),
  );
  const leadRows = (leads ?? []) as unknown as LeadRow[];
  const propertyIds = Array.from(new Set(leadRows.map((lead) => lead.property_id)));
  const { data: properties } = propertyIds.length
    ? await supabase
        .from("properties")
        .select("id,city,province")
        .in("id", propertyIds)
    : { data: [] };
  const propertyById = new Map(
    ((properties ?? []) as PropertyRow[]).map((property) => [property.id, property]),
  );
  let sent = 0;

  for (const preference of duePreferences) {
    const profile = profileById.get(preference.profile_id);
    const propertyManager = pmByProfileId.get(preference.profile_id);

    if (!profile || !propertyManager) continue;

    const since = getDigestSince(preference);
    const digestLeads = leadRows
      .filter((lead) => {
        if (!lead.published_at) return false;
        return new Date(lead.published_at).getTime() >= since.getTime();
      })
      .map((lead) => {
        const property = propertyById.get(lead.property_id);

        return {
          ...lead,
          city: property?.city ?? null,
          province: property?.province ?? null,
        };
      });

    if (!digestLeads.length) continue;

    await sendLeadDigest({
      profile,
      propertyManagerId: propertyManager.id,
      leads: digestLeads,
    });
    await preferencesTable
      .update({ last_lead_digest_sent_at: new Date().toISOString() })
      .eq("profile_id", preference.profile_id);
    sent += 1;
  }

  return NextResponse.json({ ok: true, sent });
}

function isDigestDue(preference: PreferenceRow) {
  if (!preference.last_lead_digest_sent_at) return true;

  const lastSentAt = new Date(preference.last_lead_digest_sent_at).getTime();
  const intervalMs =
    preference.new_lead_frequency === "every_3_days"
      ? 3 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

  return Date.now() - lastSentAt >= intervalMs;
}

function getDigestSince(preference: PreferenceRow) {
  if (preference.last_lead_digest_sent_at) {
    return new Date(preference.last_lead_digest_sent_at);
  }

  const days = preference.new_lead_frequency === "every_3_days" ? 3 : 1;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
