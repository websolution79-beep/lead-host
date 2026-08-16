import { appUrl } from "@/lib/env";
import { sendTransactionalEmail } from "@/lib/email/service";
import { createPrimeLeadInternalNotification } from "@/lib/notifications/internal";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type PrimeLeadAssignmentNotificationResult = {
  leadId: string;
  completed: boolean;
  emailStatus: "completed" | "failed";
  internalStatus: "completed" | "failed";
};

export async function notifyPrimeLeadAssignment(
  leadId: string,
): Promise<PrimeLeadAssignmentNotificationResult> {
  const supabase = createServiceSupabaseClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(
      "id,property_id,title,visibility_mode,prime_target_property_manager_id,prime_access_until,prime_notification_sent_at",
    )
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) throw leadError;
  if (
    !lead ||
    lead.visibility_mode !== "prime_private" ||
    !lead.prime_target_property_manager_id ||
    !lead.prime_access_until
  ) {
    throw new Error("Lead PRIME non disponibile per la notifica riservata.");
  }

  if (lead.prime_notification_sent_at) {
    return completedResult(lead.id);
  }

  const [{ data: propertyManager, error: pmError }, { data: property, error: propertyError }] =
    await Promise.all([
      supabase
        .from("property_manager_profiles")
        .select("id,profile_id,verification_status")
        .eq("id", lead.prime_target_property_manager_id)
        .maybeSingle(),
      supabase
        .from("properties")
        .select("city,province")
        .eq("id", lead.property_id)
        .maybeSingle(),
    ]);

  if (pmError) throw pmError;
  if (propertyError) throw propertyError;
  if (!propertyManager || propertyManager.verification_status === "suspended") {
    throw new Error("Property Manager PRIME non disponibile.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,status")
    .eq("id", propertyManager.profile_id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile || profile.status !== "active") {
    throw new Error("Profilo destinatario PRIME non attivo.");
  }

  const alreadySent = await hasSentPrimeLeadEmail({
    leadId: lead.id,
    profileId: profile.id,
  });
  const primeLeadUrl = `${appUrl.replace(/\/$/, "")}/app/prime/${lead.id}`;
  const emailResult = alreadySent
    ? ({ status: "sent" } as const)
    : await sendTransactionalEmail({
        to: profile.email,
        profileId: profile.id,
        propertyManagerId: propertyManager.id,
        leadId: lead.id,
        eventType: "prime.lead_assigned",
        metadata: {
          prime_private: true,
          target_property_manager_id: propertyManager.id,
          access_until: lead.prime_access_until,
        },
        templateVariables: {
          lead_title: lead.title,
          city: property?.city ?? "",
          city_suffix: property?.city ? ` a ${property.city}` : "",
          access_until: formatPrimeAccessUntil(lead.prime_access_until),
          prime_lead_url: primeLeadUrl,
        },
        subject: "",
        html: "",
        text: "",
      });
  const internalResult = await createPrimeLeadInternalNotification({
    profileId: profile.id,
    propertyManagerId: propertyManager.id,
    leadId: lead.id,
    leadTitle: lead.title,
    city: property?.city ?? null,
    accessUntil: lead.prime_access_until,
  });

  const emailCompleted =
    emailResult.status === "sent" ||
    (emailResult.status === "skipped" && emailResult.reason === "disabled");
  const internalCompleted = internalResult.status !== "failed";
  const completed = emailCompleted && internalCompleted;

  if (completed) {
    const completedAt = new Date().toISOString();
    const { data: updated, error: completionError } = await supabase
      .from("leads")
      .update({ prime_notification_sent_at: completedAt })
      .eq("id", lead.id)
      .eq("visibility_mode", "prime_private")
      .is("prime_notification_sent_at", null)
      .select("id")
      .maybeSingle();

    if (completionError) throw completionError;

    if (updated) {
      const { error: eventError } = await supabase.from("prime_lead_events").insert({
        lead_id: lead.id,
        target_property_manager_id: propertyManager.id,
        event_type: "prime_notification_sent",
        from_visibility_mode: "prime_private",
        to_visibility_mode: "prime_private",
        access_until: lead.prime_access_until,
        metadata: {
          email_status: alreadySent ? "already_sent" : emailResult.status,
          internal_status: internalResult.status,
          recipient_profile_id: profile.id,
        },
      });

      if (eventError) {
        console.warn("PRIME notification event not persisted:", eventError.message);
      }
    }
  }

  return {
    leadId: lead.id,
    completed,
    emailStatus: emailCompleted ? "completed" : "failed",
    internalStatus: internalCompleted ? "completed" : "failed",
  };
}

async function hasSentPrimeLeadEmail({
  leadId,
  profileId,
}: {
  leadId: string;
  profileId: string;
}) {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("email_delivery_logs")
    .select("id")
    .eq("lead_id", leadId)
    .eq("profile_id", profileId)
    .eq("event_type", "prime.lead_assigned")
    .eq("status", "sent")
    .limit(1);

  if (error) {
    console.warn("PRIME email duplicate check failed:", error.message);
    return false;
  }

  return Boolean(data?.length);
}

function formatPrimeAccessUntil(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(new Date(value));
}

function completedResult(leadId: string): PrimeLeadAssignmentNotificationResult {
  return {
    leadId,
    completed: true,
    emailStatus: "completed",
    internalStatus: "completed",
  };
}
