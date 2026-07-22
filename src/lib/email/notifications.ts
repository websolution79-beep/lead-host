import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { formatCurrencyCents } from "@/lib/auth/roles";
import {
  renderAdminOwnerRequestEmail,
  renderLeadDigestEmail,
  renderLeadPurchaseEmail,
  renderNewLeadEmail,
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
  transactional_enabled: boolean;
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

type NewLeadNotificationSummary = {
  recipients: number;
  alreadySent: number;
  sent: number;
  skipped: number;
  failed: number;
};

export async function sendWelcomeEmail(profile: ProfileRow) {
  const email = renderWelcomeEmail(profile.first_name);
  const firstName = profile.first_name?.trim() ?? "";

  return sendTransactionalEmail({
    to: profile.email,
    profileId: profile.id,
    eventType: "pm.welcome",
    templateVariables: {
      first_name: firstName,
      first_name_suffix: firstName ? `, ${firstName}` : "",
    },
    ...email,
  });
}

export async function sendPropertyManagerVerifiedEmail(profile: ProfileRow, propertyManagerId?: string) {
  const email = renderPropertyManagerVerifiedEmail(profile.first_name);
  const firstName = profile.first_name?.trim() ?? "";

  return sendTransactionalEmail({
    to: profile.email,
    profileId: profile.id,
    propertyManagerId,
    eventType: "pm.verified",
    templateVariables: {
      first_name: firstName,
      first_name_suffix: firstName ? `, ${firstName}` : "",
    },
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
  const adminEmails = await getSuperAdminNotificationEmails();
  const email = renderAdminOwnerRequestEmail(reference, city, propertyType);

  await Promise.all(
    adminEmails.map((to) =>
      sendTransactionalEmail({
        to,
        ownerRequestId,
        eventType: "admin.owner_request_pending",
        templateVariables: {
          reference,
          city,
          property_type: propertyType,
        },
        ...email,
      }),
    ),
  );
}

async function getSuperAdminNotificationEmails() {
  const supabase = createServiceSupabaseClient();
  const { data: roleRows, error: rolesError } = await supabase
    .from("user_roles")
    .select("profile_id")
    .eq("role", "super_admin");

  if (rolesError || !roleRows?.length) {
    return getAdminNotificationEmails();
  }

  const profileIds = Array.from(new Set(roleRows.map((item) => item.profile_id)));
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("email")
    .in("id", profileIds)
    .eq("status", "active");

  const superAdminEmails = profilesError
    ? []
    : ((profiles ?? []) as { email: string }[]).map((profile) => profile.email);

  return Array.from(new Set([...superAdminEmails, ...getAdminNotificationEmails()]));
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
    templateVariables: {
      lead_title: leadTitle,
      purchase_mode: mode,
      purchase_mode_label: mode === "exclusive" ? "esclusiva" : "condivisa",
      amount: formatCurrencyCents(amountCents),
      wallet_balance: formatCurrencyCents(balanceCents),
    },
    ...email,
  });
}

export async function sendWalletTopUpEmail({
  profile,
  walletTransactionId,
  amountCents,
  balanceCents,
}: {
  profile: ProfileRow;
  walletTransactionId: string;
  amountCents: number;
  balanceCents: number;
}) {
  const alreadySent = await hasSentWalletTopUpEmail(profile.id, walletTransactionId);

  if (alreadySent) {
    return { status: "skipped" as const, reason: "already_sent" as const };
  }

  return sendTransactionalEmail({
    to: profile.email,
    profileId: profile.id,
    eventType: "wallet.top_up",
    metadata: { wallet_transaction_id: walletTransactionId },
    templateVariables: {
      amount: formatCurrencyCents(amountCents),
      wallet_balance: formatCurrencyCents(balanceCents),
    },
    subject: "",
    html: "",
    text: "",
  });
}

export async function notifyImmediateNewLead(lead: LeadSummary) {
  const supabase = createServiceSupabaseClient();
  const emptySummary = {
    recipients: 0,
    alreadySent: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  } satisfies NewLeadNotificationSummary;
  const { data: propertyManagers, error: pmError } = await supabase
    .from("property_manager_profiles")
    .select("id,profile_id,verification_status")
    .neq("verification_status", "suspended");

  if (pmError) {
    console.warn("New lead email recipients not loaded:", pmError.message);
    return emptySummary;
  }

  if (!propertyManagers?.length) return emptySummary;

  const pmRows = propertyManagers as PropertyManagerRow[];
  const profileIds = Array.from(new Set(pmRows.map((item) => item.profile_id)));
  const [{ data: profiles, error: profilesError }, preferencesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,email,first_name,last_name,status")
      .in("id", profileIds)
      .eq("status", "active"),
    fetchEmailPreferences(supabase, profileIds),
  ]);

  if (profilesError) {
    console.warn("New lead email profiles not loaded:", profilesError.message);
    return emptySummary;
  }

  const preferencesByProfileId = new Map(
    (preferencesResult.data ?? []).map((item) => [item.profile_id, item]),
  );
  const pmByProfileId = new Map(pmRows.map((item) => [item.profile_id, item]));
  const email = renderNewLeadEmail({
    leadTitle: lead.title,
    city: lead.city,
    sharedPriceCents: lead.shared_price_cents,
    exclusivePriceCents: lead.exclusive_price_cents,
  });

  const eligibleProfiles = ((profiles ?? []) as ProfileRow[]).filter((profile) => {
    const preference = preferencesByProfileId.get(profile.id);
    const transactionalEnabled = preference?.transactional_enabled ?? true;

    return (
      transactionalEnabled &&
      (preference?.new_lead_frequency ?? "immediate") === "immediate"
    );
  });
  const alreadySentEmails = await fetchAlreadySentNewLeadEmails(
    supabase,
    lead.id,
    eligibleProfiles.map((profile) => profile.email),
  );
  const recipients = eligibleProfiles.filter(
    (profile) => !alreadySentEmails.has(profile.email),
  );
  const results = await Promise.all(
    recipients.map((profile) =>
      sendTransactionalEmail({
        to: profile.email,
        profileId: profile.id,
        propertyManagerId: pmByProfileId.get(profile.id)?.id ?? null,
        leadId: lead.id,
        eventType: "lead.new_available",
        templateVariables: {
          lead_title: lead.title,
          city: lead.city ?? "",
          city_suffix: lead.city ? ` - ${lead.city}` : "",
          shared_price: formatCurrencyCents(lead.shared_price_cents),
          exclusive_price: formatCurrencyCents(lead.exclusive_price_cents),
        },
        ...email,
      }),
    ),
  );

  return results.reduce<NewLeadNotificationSummary>(
    (summary, result) => {
      if (result.status === "sent") summary.sent += 1;
      if (result.status === "skipped") summary.skipped += 1;
      if (result.status === "failed") summary.failed += 1;

      return summary;
    },
    {
      recipients: eligibleProfiles.length,
      alreadySent: alreadySentEmails.size,
      sent: 0,
      skipped: 0,
      failed: 0,
    },
  );
}

async function fetchEmailPreferences(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  profileIds: string[],
) {
  const preferencesTable = supabase.from("email_preferences" as never) as unknown as {
    select: (columns: string) => {
      in: (
        column: string,
        values: string[],
      ) => Promise<{
        data: EmailPreferenceRow[] | null;
        error: { message?: string } | null;
      }>;
    };
  };

  const { data, error } = await preferencesTable
    .select("profile_id,new_lead_frequency,transactional_enabled,last_lead_digest_sent_at")
    .in("profile_id", profileIds);

  if (error) {
    console.warn("New lead email preferences not loaded:", error.message);
    return { data: null };
  }

  return { data };
}

async function fetchAlreadySentNewLeadEmails(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  leadId: string,
  emails: string[],
) {
  if (!emails.length) return new Set<string>();

  type EmailLogsQuery = {
    eq: (column: string, value: string) => EmailLogsQuery;
    in: (
      column: string,
      values: string[],
    ) => Promise<{
      data: { recipient_email: string }[] | null;
      error: { message?: string } | null;
    }>;
  };
  const logsTable = supabase.from("email_delivery_logs" as never) as unknown as {
    select: (columns: string) => EmailLogsQuery;
  };

  const { data, error } = await logsTable
    .select("recipient_email")
    .eq("lead_id", leadId)
    .eq("event_type", "lead.new_available")
    .eq("status", "sent")
    .in("recipient_email", emails);

  if (error) {
    console.warn("New lead email duplicate check failed:", error.message);
    return new Set<string>();
  }

  return new Set((data ?? []).map((item) => item.recipient_email));
}

async function hasSentWalletTopUpEmail(profileId: string, walletTransactionId: string) {
  type EmailLogsQuery = {
    eq: (column: string, value: string) => EmailLogsQuery;
    limit: (
      count: number,
    ) => Promise<{
      data: { metadata: unknown }[] | null;
      error: { message?: string } | null;
    }>;
  };
  const supabase = createServiceSupabaseClient();
  const logsTable = supabase.from("email_delivery_logs" as never) as unknown as {
    select: (columns: string) => EmailLogsQuery;
  };
  const { data, error } = await logsTable
    .select("metadata")
    .eq("profile_id", profileId)
    .eq("event_type", "wallet.top_up")
    .eq("status", "sent")
    .limit(20);

  if (error) {
    console.warn("Wallet top-up email duplicate check failed:", error.message);
    return false;
  }

  return (data ?? []).some((item) => {
    const metadata = item.metadata;

    return (
      Boolean(metadata) &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      (metadata as Record<string, unknown>).wallet_transaction_id === walletTransactionId
    );
  });
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
    templateVariables: {
      lead_count: leads.length,
      lead_list_text: leads
        .map(
          (lead) =>
            `- ${lead.title}${lead.city ? `, ${lead.city}` : ""}: condiviso ${formatCurrencyCents(lead.shared_price_cents)}, esclusivo ${formatCurrencyCents(lead.exclusive_price_cents)}`,
        )
        .join("\n"),
    },
    ...email,
  });
}
