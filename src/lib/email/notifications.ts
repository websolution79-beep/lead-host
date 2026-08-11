import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { formatCurrencyCents } from "@/lib/auth/roles";
import {
  fetchEffectiveMarketplacePromotion,
  resolvePromotionalPrice,
} from "@/lib/config/marketplace-promotions";
import {
  renderAdminOwnerRequestEmail,
  renderLeadDigestEmail,
  renderLeadPurchaseEmail,
  renderNewLeadEmail,
  renderPropertyManagerVerifiedEmail,
  renderWelcomeEmail,
} from "@/lib/email/templates";
import {
  sendTransactionalEmail,
  sendTransactionalEmailToInternalRecipients,
  sendTransactionalEmailWithInternalCopies,
} from "@/lib/email/service";
import {
  createLeadPurchaseInternalNotification,
  createNewLeadInternalNotifications,
  createPropertyManagerVerifiedInternalNotification,
  createWalletTopUpInternalNotification,
} from "@/lib/notifications/internal";

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

  await createPropertyManagerVerifiedInternalNotification({
    profileId: profile.id,
    propertyManagerId,
  });

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
  const email = renderAdminOwnerRequestEmail(reference, city, propertyType);

  await sendTransactionalEmailToInternalRecipients({
    ownerRequestId,
    eventType: "admin.owner_request_pending",
    templateVariables: {
      reference,
      city,
      property_type: propertyType,
    },
    ...email,
  });
}

export async function sendSupportRequestAdminNotification({
  reportId,
  propertyManagerName,
  propertyManagerEmail,
  requestSubject,
  requestDetails,
  leadContext,
}: {
  reportId: string;
  propertyManagerName: string;
  propertyManagerEmail: string;
  requestSubject: string;
  requestDetails: string;
  leadContext: string;
}) {
  return sendTransactionalEmailToInternalRecipients({
    eventType: "admin.support_request_pending",
    metadata: { support_report_id: reportId },
    templateVariables: {
      property_manager_name: propertyManagerName,
      property_manager_email: propertyManagerEmail,
      request_subject: requestSubject,
      request_details: requestDetails,
      lead_context: leadContext,
    },
    subject: "",
    html: "",
    text: "",
  });
}

export async function sendSupportMessageAdminNotification({
  reportId,
  propertyManagerName,
  propertyManagerEmail,
  requestSubject,
  reply,
  leadContext,
}: {
  reportId: string;
  propertyManagerName: string;
  propertyManagerEmail: string;
  requestSubject: string;
  reply: string;
  leadContext: string;
}) {
  return sendTransactionalEmailToInternalRecipients({
    eventType: "admin.support_request_reply",
    metadata: { support_report_id: reportId },
    templateVariables: {
      property_manager_name: propertyManagerName,
      property_manager_email: propertyManagerEmail,
      request_subject: requestSubject,
      reply,
      lead_context: leadContext,
    },
    subject: "",
    html: "",
    text: "",
  });
}

export async function sendSupportReplyEmail({
  profile,
  reportId,
  requestSubject,
  reply,
  leadContext,
}: {
  profile: Pick<ProfileRow, "id" | "email">;
  reportId: string;
  requestSubject: string;
  reply: string;
  leadContext: string;
}) {
  return sendTransactionalEmail({
    to: profile.email,
    profileId: profile.id,
    eventType: "support.reply",
    metadata: { support_report_id: reportId },
    templateVariables: {
      request_subject: requestSubject,
      reply,
      lead_context: leadContext,
    },
    subject: "",
    html: "",
    text: "",
  });
}

export async function sendOwnerRequestCompletionEmail({
  ownerRequestId,
  to,
  propertyHint,
  completionUrl,
  expiresAt,
}: {
  ownerRequestId: string;
  to: string;
  propertyHint: string;
  completionUrl: string;
  expiresAt: string;
}) {
  return sendTransactionalEmail({
    to,
    ownerRequestId,
    eventType: "owner.completion_requested",
    templateVariables: {
      property_hint: propertyHint,
      completion_url: completionUrl,
      expires_at: new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(new Date(expiresAt)),
    },
    subject: "",
    html: "",
    text: "",
  });
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
  const amount = formatCurrencyCents(amountCents);
  const balance = formatCurrencyCents(balanceCents);
  const purchaseModeLabel = mode === "exclusive" ? "esclusiva" : "condivisa";

  await createLeadPurchaseInternalNotification({
    profileId: profile.id,
    propertyManagerId,
    leadPurchaseId,
    leadId,
    leadTitle,
    modeLabel: purchaseModeLabel,
    amount,
    balance,
  });

  return sendTransactionalEmailWithInternalCopies({
    to: profile.email,
    profileId: profile.id,
    propertyManagerId,
    leadPurchaseId,
    leadId,
    eventType: "lead.purchased",
    templateVariables: {
      lead_title: leadTitle,
      purchase_mode: mode,
      purchase_mode_label: purchaseModeLabel,
      amount,
      wallet_balance: balance,
    },
    ...email,
  });
}

export async function sendWalletTopUpEmail({
  profile,
  walletTransactionId,
  amountCents,
  balanceCents,
  bonusAmountCents = 0,
  couponCode = null,
}: {
  profile: ProfileRow;
  walletTransactionId: string;
  amountCents: number;
  balanceCents: number;
  bonusAmountCents?: number;
  couponCode?: string | null;
}) {
  const alreadySent = await hasSentWalletTopUpEmail(profile.id, walletTransactionId);

  if (alreadySent) {
    return { status: "skipped" as const, reason: "already_sent" as const };
  }
  const amount = formatCurrencyCents(amountCents);
  const balance = formatCurrencyCents(balanceCents);
  const bonus = formatCurrencyCents(bonusAmountCents);
  const walletCredit = formatCurrencyCents(amountCents + bonusAmountCents);
  const bonusMessage =
    bonusAmountCents > 0 && couponCode
      ? ` Bonus coupon ${couponCode}: ${bonus}. Credito totale ricevuto: ${walletCredit}.`
      : "";

  await createWalletTopUpInternalNotification({
    profileId: profile.id,
    walletTransactionId,
    amount,
    balance,
    bonus,
    couponCode,
    walletCredit,
  });

  return sendTransactionalEmailWithInternalCopies({
    to: profile.email,
    profileId: profile.id,
    eventType: "wallet.top_up",
    metadata: {
      wallet_transaction_id: walletTransactionId,
      bonus_amount_cents: bonusAmountCents,
      coupon_code: couponCode,
    },
    templateVariables: {
      amount,
      wallet_balance: balance,
      bonus_amount: bonus,
      wallet_credit: walletCredit,
      coupon_code: couponCode ?? "",
      bonus_message: bonusMessage,
    },
    subject: "",
    html: "",
    text: "",
  });
}

export async function sendMarketingAddonActivationEmails({
  profileId,
  subscriptionId,
  addonProductId,
  status,
  trialDays,
  trialEndsAt,
  occurredAt,
}: {
  profileId: string;
  subscriptionId: string;
  addonProductId: string;
  status: string;
  trialDays: number;
  trialEndsAt: string | null;
  occurredAt: string;
}) {
  const supabase = createServiceSupabaseClient();
  const [{ data: profile, error: profileError }, { data: product, error: productError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id,email,first_name,last_name,status")
        .eq("id", profileId)
        .maybeSingle(),
      supabase
        .from("addon_products")
        .select("name,sale_price_cents,currency")
        .eq("id", addonProductId)
        .maybeSingle(),
    ]);

  if (profileError || productError) {
    throw new Error(profileError?.message ?? productError?.message ?? "Dati Modulo Marketing non disponibili.");
  }
  if (!profile || profile.status !== "active" || !product) {
    return { status: "skipped" as const, reason: "profile_or_product_not_found" as const };
  }

  const firstName = profile.first_name?.trim() ?? "";
  const addonName = product.name ?? "Modulo Marketing";
  const trialEndDate = trialEndsAt ? formatEmailDate(trialEndsAt) : "non prevista";
  const firstPaymentDate = trialEndsAt ? formatEmailDate(trialEndsAt) : formatEmailDate(occurredAt);
  const firstPaymentAmount = formatCurrencyCents(product.sale_price_cents ?? 0);
  const subscriptionStatus = status === "trialing" ? "in prova gratuita" : "attivo";
  const metadata = {
    addon_subscription_id: subscriptionId,
    addon_product_id: addonProductId,
  };
  const variables = {
    first_name: firstName,
    first_name_suffix: firstName ? `, ${firstName}` : "",
    addon_name: addonName,
    trial_days: trialDays,
    trial_end_date: trialEndDate,
    first_payment_date: firstPaymentDate,
    first_payment_amount: firstPaymentAmount,
    subscription_status: subscriptionStatus,
  };

  const customerEmailSent = await hasSentAddonActivationEmail(
    "addon.marketing_activated",
    subscriptionId,
  );
  const customerResult = customerEmailSent
    ? { status: "skipped" as const, reason: "already_sent" as const }
    : await sendTransactionalEmail({
        to: profile.email,
        profileId: profile.id,
        eventType: "addon.marketing_activated",
        metadata,
        templateVariables: variables,
        subject: "",
        html: "",
        text: "",
      });

  const adminEmailSent = await hasSentAddonActivationEmail(
    "admin.addon_marketing_activated",
    subscriptionId,
  );
  const adminResult = adminEmailSent
    ? { status: "skipped" as const, reason: "already_sent" as const }
    : await sendTransactionalEmailToInternalRecipients({
        eventType: "admin.addon_marketing_activated",
        metadata,
        templateVariables: {
          ...variables,
          customer_name: [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.email,
          customer_email: profile.email,
          subscription_id: subscriptionId,
        },
        subject: "",
        html: "",
        text: "",
      });

  return { status: "processed" as const, customerResult, adminResult };
}

export async function notifyImmediateNewLead(lead: LeadSummary) {
  const supabase = createServiceSupabaseClient();
  const { promotion } = await fetchEffectiveMarketplacePromotion(supabase);
  const effectiveLead: LeadSummary = {
    ...lead,
    shared_price_cents: resolvePromotionalPrice(
      promotion,
      "shared",
      lead.shared_price_cents,
    ).amountCents,
    exclusive_price_cents: resolvePromotionalPrice(
      promotion,
      "exclusive",
      lead.exclusive_price_cents,
    ).amountCents,
  };
  await createNewLeadInternalNotifications({
    leadId: effectiveLead.id,
    title: effectiveLead.title,
    city: effectiveLead.city,
    province: effectiveLead.province,
    sharedPrice: formatCurrencyCents(effectiveLead.shared_price_cents),
    exclusivePrice: formatCurrencyCents(effectiveLead.exclusive_price_cents),
  });
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
    leadTitle: effectiveLead.title,
    city: effectiveLead.city,
    sharedPriceCents: effectiveLead.shared_price_cents,
    exclusivePriceCents: effectiveLead.exclusive_price_cents,
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
    effectiveLead.id,
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
        leadId: effectiveLead.id,
        eventType: "lead.new_available",
        templateVariables: {
          lead_title: effectiveLead.title,
          city: effectiveLead.city ?? "",
          city_suffix: effectiveLead.city ? ` - ${effectiveLead.city}` : "",
          shared_price: formatCurrencyCents(effectiveLead.shared_price_cents),
          exclusive_price: formatCurrencyCents(effectiveLead.exclusive_price_cents),
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

async function hasSentAddonActivationEmail(
  eventType: "addon.marketing_activated" | "admin.addon_marketing_activated",
  subscriptionId: string,
) {
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
    .eq("event_type", eventType)
    .eq("status", "sent")
    .limit(100);

  if (error) {
    console.warn("Addon email duplicate check failed:", error.message);
    return false;
  }

  return (data ?? []).some((item) => {
    const metadata = item.metadata;

    return (
      Boolean(metadata) &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      (metadata as Record<string, unknown>).addon_subscription_id === subscriptionId
    );
  });
}

function formatEmailDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
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
  const supabase = createServiceSupabaseClient();
  const { promotion } = await fetchEffectiveMarketplacePromotion(supabase);
  const effectiveLeads = leads.map((lead) => ({
    ...lead,
    shared_price_cents: resolvePromotionalPrice(
      promotion,
      "shared",
      lead.shared_price_cents,
    ).amountCents,
    exclusive_price_cents: resolvePromotionalPrice(
      promotion,
      "exclusive",
      lead.exclusive_price_cents,
    ).amountCents,
  }));
  const email = renderLeadDigestEmail(
    effectiveLeads.map((lead) => ({
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
    metadata: { lead_ids: effectiveLeads.map((lead) => lead.id) },
    templateVariables: {
      lead_count: effectiveLeads.length,
      lead_list_text: effectiveLeads
        .map(
          (lead) =>
            `- ${lead.title}${lead.city ? `, ${lead.city}` : ""}: condiviso ${formatCurrencyCents(lead.shared_price_cents)}, esclusivo ${formatCurrencyCents(lead.exclusive_price_cents)}`,
        )
        .join("\n"),
    },
    ...email,
  });
}
