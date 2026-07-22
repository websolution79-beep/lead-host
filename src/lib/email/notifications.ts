import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  renderAdminOwnerRequestEmail,
  renderLeadDigestEmail,
  renderLeadPurchaseEmail,
  renderNewLeadEmail,
  renderOwnerRequestReceivedEmail,
  renderPropertyManagerVerifiedEmail,
  renderWelcomeEmail,
} from "@/lib/email/templates";
import { getAdminNotificationEmails, sendTransactionalEmail } from "@/lib/email/service";

type ProfileRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
};

type PropertyManagerRow = {
  id: string;
  profile_id: string;
  verification_status: string;
};

type EmailPreferenceRow = {
  profile_id: string;
  new_lead_frequency: "immediate" | "daily" | "every_3_days" | "off";
  last_lead_digest_sent_at: string | null;
};

type LeadSummary = {
  id: string;
  title: string;
  city: string | null;
  province: string | null;
  shared_price_cents: number;
  exclusive_price_cents: number;
};

export async function sendWelcomeEmail(profile: ProfileRow) {
  const email = renderWelcomeEmail(profile.first_name);

  return sendTransactionalEmail({
    to: profile.email,
    profileId: profile.id,
    eventType: "pm.welcome",
    ...email,
  });
}

export async function sendPropertyManagerVerifiedEmail(profile: ProfileRow, propertyManagerId?: string) {
  const email = renderPropertyManagerVerifiedEmail(profile.first_name);

  return sendTransactionalEmail({
    to: profile.email,
    profileId: profile.id,
    propertyManagerId,
    eventType: "pm.verified",
    ...email,
  });
}

export async function sendOwnerRequestReceivedEmail({
  to,
  reference,
  ownerRequestId,
}: {
  to: string;
  reference: string;
  ownerRequestId: string;
}) {
  const email = renderOwnerRequestReceivedEmail(reference);

  return sendTransactionalEmail({
    to,
    ownerRequestId,
    eventType: "owner.request_received",
    ...email,
  });
}

export async function sendAdminOwnerRequestNotification({
  ownerRequestId,
  reference,
  city,
  propertyType,
}: {
  ownerRequestId: string;
  reference: string;
  city: string;
  propertyType: string;
}) {
  const adminEmails = getAdminNotificationEmails();
  const email = renderAdminOwnerRequestEmail(reference, city, propertyType);

  await Promise.all(
    adminEmails.map((to) =>
      sendTransactionalEmail({
        to,
        ownerRequestId,
        eventType: "admin.owner_request_pending",
        ...email,
      }),
    ),
  );
}

export async function sendLeadPurchaseEmail({
  profile,
  propertyManagerId,
  leadPurchaseId,
  leadId,
  leadTitle,
  mode,
  amountCents,
  balanceCents,
}: {
  profile: ProfileRow;
  propertyManagerId: string;
  leadPurchaseId: string;
  leadId: string;
  leadTitle: string;
  mode: "shared" | "exclusive";
  amountCents: number;
  balanceCents: number;
}) {
  const email = renderLeadPurchaseEmail({
    leadTitle,
    mode,
    amountCents,
    balanceCents,
  });

  return sendTransactionalEmail({
    to: profile.email,
    profileId: profile.id,
    propertyManagerId,
    leadPurchaseId,
    leadId,
    eventType: "lead.purchased",
    ...email,
  });
}

export async function notifyImmediateNewLead(lead: LeadSummary) {
  const supabase = createServiceSupabaseClient();
  const { data: propertyManagers, error: pmError } = await supabase
    .from("property_manager_profiles")
    .select("id,profile_id,verification_status")
    .neq("verification_status", "suspended");

  if (pmError || !propertyManagers?.length) return;

  const pmRows = propertyManagers as PropertyManagerRow[];
  const profileIds = Array.from(new Set(pmRows.map((item) => item.profile_id)));
  const [{ data: profiles }, { data: preferences }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,email,first_name,last_name,status")
      .in("id", profileIds)
      .eq("status", "active"),
    (supabase.from("email_preferences" as never) as unknown as {
      select: (columns: string) => {
        in: (column: string, values: string[]) => Promise<{ data: EmailPreferenceRow[] | null }>;
      };
    })
      .select("profile_id,new_lead_frequency,last_lead_digest_sent_at")
      .in("profile_id", profileIds)
      .catch(() => ({ data: null })),
  ]);

  const preferencesByProfileId = new Map(
    (preferences ?? []).map((item) => [item.profile_id, item]),
  );
  const pmByProfileId = new Map(pmRows.map((item) => [item.profile_id, item]));
  const email = renderNewLeadEmail({
    leadTitle: lead.title,
    city: lead.city,
    sharedPriceCents: lead.shared_price_cents,
    exclusivePriceCents: lead.exclusive_price_cents,
  });

  await Promise.all(
    ((profiles ?? []) as ProfileRow[])
      .filter((profile) => {
        const preference = preferencesByProfileId.get(profile.id);
        return (preference?.new_lead_frequency ?? "immediate") === "immediate";
      })
      .map((profile) =>
        sendTransactionalEmail({
          to: profile.email,
          profileId: profile.id,
          propertyManagerId: pmByProfileId.get(profile.id)?.id ?? null,
          leadId: lead.id,
          eventType: "lead.new_available",
          ...email,
        }),
      ),
  );
}

export async function sendLeadDigest({
  profile,
  propertyManagerId,
  leads,
}: {
  profile: ProfileRow;
  propertyManagerId: string;
  leads: LeadSummary[];
}) {
  const email = renderLeadDigestEmail(
    leads.map((lead) => ({
      title: lead.title,
      city: lead.city,
      province: lead.province,
      sharedPriceCents: lead.shared_price_cents,
      exclusivePriceCents: lead.exclusive_price_cents,
    })),
  );

  return sendTransactionalEmail({
    to: profile.email,
    profileId: profile.id,
    propertyManagerId,
    eventType: "lead.digest",
    metadata: { lead_ids: leads.map((lead) => lead.id) },
    ...email,
  });
}
