import { notifyImmediateNewLead } from "@/lib/email/notifications";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { notifyNewLeadOnTelegram } from "@/lib/telegram/service";

export type PublicLeadPublicationNotificationResult = {
  leadId: string;
  completed: boolean;
  emailStatus: "completed" | "failed";
  telegramStatus: "completed" | "failed";
};

export async function notifyPublicLeadPublication(
  leadId: string,
): Promise<PublicLeadPublicationNotificationResult> {
  const supabase = createServiceSupabaseClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(
      "id,owner_request_id,property_id,title,shared_price_cents,exclusive_price_cents,shared_slots_sold,visibility_mode,published_at,public_notification_sent_at",
    )
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) throw leadError;
  if (!lead || lead.visibility_mode !== "public" || !lead.published_at) {
    throw new Error("Lead pubblico non disponibile per le notifiche.");
  }

  if (lead.public_notification_sent_at) {
    return {
      leadId,
      completed: true,
      emailStatus: "completed",
      telegramStatus: "completed",
    };
  }

  const [{ data: property, error: propertyError }, ownerRequestResult] =
    await Promise.all([
      supabase
        .from("properties")
        .select("city,province,property_type")
        .eq("id", lead.property_id)
        .maybeSingle(),
      supabase
        .from("owner_requests")
        .select("subletting_available")
        .eq("id", lead.owner_request_id)
        .maybeSingle(),
    ]);

  if (propertyError) throw propertyError;
  if (!property) throw new Error("Immobile del lead non trovato.");

  const sublettingAvailable = ownerRequestResult.error
    ? false
    : Boolean(ownerRequestResult.data?.subletting_available);
  const results = await Promise.allSettled([
    notifyImmediateNewLead({
      id: lead.id,
      title: lead.title,
      city: property.city,
      province: property.province,
      shared_price_cents: lead.shared_price_cents,
      exclusive_price_cents: lead.exclusive_price_cents,
    }),
    notifyNewLeadOnTelegram({
      id: lead.id,
      title: lead.title,
      city: property.city,
      province: property.province,
      propertyType: property.property_type,
      sharedPriceCents: lead.shared_price_cents,
      exclusivePriceCents: lead.exclusive_price_cents,
      sharedSlotsSold: lead.shared_slots_sold,
      sublettingAvailable,
    }),
  ]);

  const emailResult = results[0];
  const telegramResult = results[1];
  const emailCompleted =
    emailResult.status === "fulfilled" && emailResult.value.failed === 0;
  const telegramCompleted =
    telegramResult.status === "fulfilled" &&
    telegramResult.value.status !== "failed";
  const completed = emailCompleted && telegramCompleted;

  if (completed) {
    const { error: completionError } = await supabase
      .from("leads")
      .update({ public_notification_sent_at: new Date().toISOString() })
      .eq("id", lead.id)
      .is("public_notification_sent_at", null);

    if (completionError) throw completionError;
  }

  if (emailResult.status === "rejected") {
    console.warn("Public lead email notification failed:", emailResult.reason);
  }
  if (telegramResult.status === "rejected") {
    console.warn(
      "Public lead Telegram notification failed:",
      telegramResult.reason,
    );
  }

  return {
    leadId,
    completed,
    emailStatus: emailCompleted ? "completed" : "failed",
    telegramStatus: telegramCompleted ? "completed" : "failed",
  };
}
