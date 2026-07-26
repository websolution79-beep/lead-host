import { after, NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  getBrevoWebhookSecret,
  MARKETING_CONSENT_POLICY_VERSION,
} from "@/lib/brevo/config";
import { runBrevoWorkerSafely } from "@/lib/brevo/worker";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type BrevoWebhookPayload = {
  id?: string | number;
  event?: string;
  email?: string;
  camp_id?: string | number;
  campaign_name?: string;
  list_id?: Array<string | number>;
  ts_event?: number;
  ts?: number;
};

export async function POST(request: NextRequest) {
  const secret = getBrevoWebhookSecret();

  if (!secret || !hasValidBearerToken(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const events = (Array.isArray(body) ? body : [body]).filter(
    (item): item is BrevoWebhookPayload =>
      Boolean(item && typeof item === "object"),
  );
  const unsubscribeEvents = events.filter((event) =>
    ["unsubscribe", "unsubscribed"].includes(
      event.event?.trim().toLowerCase() ?? "",
    ),
  );

  if (!unsubscribeEvents.length) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const supabase = createServiceSupabaseClient();
  const rpc = supabase as unknown as {
    rpc: (
      fn: "record_pm_marketing_consent",
      args: Record<string, unknown>,
    ) => Promise<{ error: { message?: string } | null }>;
  };
  let processed = 0;

  for (const event of unsubscribeEvents) {
    const email = event.email?.trim().toLowerCase();
    if (!email) continue;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (!profile) continue;

    const { data: propertyManager } = await supabase
      .from("property_manager_profiles")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();

    if (!propertyManager) continue;

    const externalEventId = [
      "brevo",
      event.id ?? "webhook",
      event.camp_id ?? "campaign",
      event.ts_event ?? event.ts ?? "timestamp",
      email,
    ].join(":");
    const { error } = await rpc.rpc("record_pm_marketing_consent", {
      p_profile_id: profile.id,
      p_status: "withdrawn",
      p_source: "brevo_unsubscribe",
      p_policy_version: MARKETING_CONSENT_POLICY_VERSION,
      p_evidence: {
        campaign_id: event.camp_id ?? null,
        campaign_name: event.campaign_name?.slice(0, 250) ?? null,
        list_ids: event.list_id ?? [],
        event_timestamp: event.ts_event ?? event.ts ?? null,
      },
      p_external_event_id: externalEventId,
    });

    if (error) {
      console.error("Brevo unsubscribe webhook failed:", error.message);
      return NextResponse.json(
        { error: "Webhook non elaborato." },
        { status: 500 },
      );
    }

    processed += 1;
  }

  after(() => runBrevoWorkerSafely(10));

  return NextResponse.json({ ok: true, processed });
}

function hasValidBearerToken(request: NextRequest, expectedToken: string) {
  const providedToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!providedToken) return false;

  const expected = Buffer.from(expectedToken);
  const provided = Buffer.from(providedToken);

  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}
