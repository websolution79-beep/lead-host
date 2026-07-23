import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { getSupportSubjectLabel } from "@/lib/support/reports";

type InternalNotificationPayload = {
  profileId: string;
  propertyManagerId?: string | null;
  eventType: string;
  title: string;
  body?: string | null;
  metadata?: Json;
  sentAt?: string | null;
};

type PropertyManagerRecipient = {
  id: string;
  profile_id: string;
  verification_status: string;
  profiles: {
    id: string;
    status: string;
  } | null;
};

type NotificationRow = {
  profile_id: string | null;
};

type NotificationsTable = {
  insert: (
    row: Record<string, unknown> | Record<string, unknown>[],
  ) => Promise<{ error: { message?: string } | null }>;
  select: (columns: string) => NotificationQuery;
};

type NotificationQuery = {
  eq: (column: string, value: string) => NotificationQuery;
  contains: (
    column: string,
    value: Record<string, unknown>,
  ) => Promise<{ data: NotificationRow[] | null; error: { message?: string } | null }>;
};

export async function createInternalNotification(payload: InternalNotificationPayload) {
  const supabase = createServiceSupabaseClient();
  const notifications = getNotificationsTable(supabase);
  const { error } = await notifications.insert(toInsertRow(payload));

  if (error) {
    console.warn("Internal notification not persisted:", error.message);
    return { status: "failed" as const, error: error.message };
  }

  return { status: "created" as const };
}

export async function createNewLeadInternalNotifications({
  leadId,
  title,
  city,
  province,
  sharedPrice,
  exclusivePrice,
}: {
  leadId: string;
  title: string;
  city: string | null;
  province: string | null;
  sharedPrice: string;
  exclusivePrice: string;
}) {
  const supabase = createServiceSupabaseClient();
  const { data: recipients, error } = await supabase
    .from("property_manager_profiles")
    .select("id,profile_id,verification_status,profiles(id,status)")
    .neq("verification_status", "suspended");

  if (error) {
    console.warn("Internal new lead recipients not loaded:", error.message);
    return { created: 0, skipped: 0 };
  }

  const activeRecipients = ((recipients ?? []) as unknown as PropertyManagerRecipient[])
    .filter((recipient) => recipient.profiles?.status === "active");

  if (!activeRecipients.length) return { created: 0, skipped: 0 };

  const notifications = getNotificationsTable(supabase);
  const existing = await notifications
    .select("profile_id")
    .eq("event_type", "lead.new_available")
    .contains("metadata", { lead_id: leadId });
  const existingProfileIds = new Set(
    (existing.data ?? [])
      .map((item) => item.profile_id)
      .filter((profileId): profileId is string => Boolean(profileId)),
  );
  const rows = activeRecipients
    .filter((recipient) => !existingProfileIds.has(recipient.profile_id))
    .map((recipient) =>
      toInsertRow({
        profileId: recipient.profile_id,
        propertyManagerId: recipient.id,
        eventType: "lead.new_available",
        title: "Nuovo lead disponibile",
        body: `${title}${city ? ` a ${city}` : ""}. Quote da ${sharedPrice}, esclusiva da ${exclusivePrice}.`,
        metadata: {
          lead_id: leadId,
          lead_title: title,
          city,
          province,
          href: `/app/marketplace/${leadId}`,
        },
      }),
    );

  if (!rows.length) {
    return { created: 0, skipped: activeRecipients.length };
  }

  const { error: insertError } = await notifications.insert(rows);

  if (insertError) {
    console.warn("Internal new lead notifications not persisted:", insertError.message);
    return { created: 0, skipped: activeRecipients.length };
  }

  return { created: rows.length, skipped: activeRecipients.length - rows.length };
}

export async function createLeadPurchaseInternalNotification({
  profileId,
  propertyManagerId,
  leadId,
  leadPurchaseId,
  leadTitle,
  modeLabel,
  amount,
  balance,
}: {
  profileId: string;
  propertyManagerId: string;
  leadId: string;
  leadPurchaseId: string;
  leadTitle: string;
  modeLabel: string;
  amount: string;
  balance: string;
}) {
  return createInternalNotification({
    profileId,
    propertyManagerId,
    eventType: "lead.purchased",
    title: "Lead acquistato",
    body: `${leadTitle}: acquisto ${modeLabel} completato per ${amount}. Saldo wallet ${balance}.`,
    metadata: {
      lead_id: leadId,
      lead_purchase_id: leadPurchaseId,
      href: `/app/i-miei-lead/${leadId}`,
    },
  });
}

export async function createWalletTopUpInternalNotification({
  profileId,
  walletTransactionId,
  amount,
  balance,
}: {
  profileId: string;
  walletTransactionId: string;
  amount: string;
  balance: string;
}) {
  return createInternalNotification({
    profileId,
    eventType: "wallet.top_up",
    title: "Ricarica wallet completata",
    body: `Hai ricaricato ${amount}. Il saldo disponibile e ${balance}.`,
    metadata: {
      wallet_transaction_id: walletTransactionId,
      href: "/app/acquisti",
    },
  });
}

export async function createPropertyManagerVerifiedInternalNotification({
  profileId,
  propertyManagerId,
}: {
  profileId: string;
  propertyManagerId?: string | null;
}) {
  return createInternalNotification({
    profileId,
    propertyManagerId,
    eventType: "pm.verified",
    title: "Profilo verificato",
    body: "Il tuo profilo Property Manager e stato verificato. Puoi acquistare lead dal marketplace.",
    metadata: {
      href: "/app/marketplace",
    },
  });
}

export async function createSupportReportInternalNotification({
  profileId,
  propertyManagerId,
  reportId,
  subject,
  leadTitle,
}: {
  profileId: string;
  propertyManagerId: string;
  reportId: string;
  subject: string;
  leadTitle?: string | null;
}) {
  const context = leadTitle ? ` sul lead ${leadTitle}` : "";
  const subjectLabel = getSupportSubjectLabel(subject).toLowerCase();

  return createInternalNotification({
    profileId,
    propertyManagerId,
    eventType: "support.report_submitted",
    title: "Richiesta inviata",
    body: `Abbiamo ricevuto la tua richiesta di ${subjectLabel}${context}. La troverai in Assistenza.`,
    metadata: {
      report_id: reportId,
      href: "/app/assistenza",
    },
  });
}

function getNotificationsTable(supabase: ReturnType<typeof createServiceSupabaseClient>) {
  return supabase.from("notifications" as never) as unknown as NotificationsTable;
}

function toInsertRow(payload: InternalNotificationPayload) {
  return {
    profile_id: payload.profileId,
    property_manager_id: payload.propertyManagerId ?? null,
    channel: "internal",
    event_type: payload.eventType,
    title: payload.title,
    body: payload.body ?? null,
    metadata: payload.metadata ?? {},
    sent_at: payload.sentAt ?? new Date().toISOString(),
  };
}
