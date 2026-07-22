import { getEnv } from "@/lib/env";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type EmailEventType =
  | "pm.welcome"
  | "pm.verified"
  | "admin.owner_request_pending"
  | "lead.purchased"
  | "lead.new_available"
  | "lead.digest";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  eventType: EmailEventType;
  profileId?: string | null;
  propertyManagerId?: string | null;
  ownerRequestId?: string | null;
  leadId?: string | null;
  leadPurchaseId?: string | null;
  metadata?: Json;
};

type ResendResponse = {
  id?: string;
  message?: string;
  name?: string;
};

export async function sendTransactionalEmail(payload: EmailPayload) {
  const supabase = createServiceSupabaseClient();
  const apiKey = getEnv("RESEND_API_KEY");
  const from = getEnv("TRANSACTIONAL_EMAIL_FROM");

  if (!apiKey || !from) {
    await logEmailDelivery({
      ...payload,
      status: "skipped",
      errorMessage: "RESEND_API_KEY or TRANSACTIONAL_EMAIL_FROM not configured.",
    });

    return { status: "skipped" as const };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as ResendResponse;

    if (!response.ok) {
      await logEmailDelivery({
        ...payload,
        status: "failed",
        errorMessage: result.message ?? result.name ?? "Resend request failed.",
      });

      return { status: "failed" as const, error: result };
    }

    await logEmailDelivery({
      ...payload,
      status: "sent",
      providerMessageId: result.id ?? null,
    });

    return { status: "sent" as const, id: result.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error.";
    await logEmailDelivery({ ...payload, status: "failed", errorMessage: message });

    return { status: "failed" as const, error: message };
  }

  async function logEmailDelivery({
    to,
    subject,
    eventType,
    profileId,
    propertyManagerId,
    ownerRequestId,
    leadId,
    leadPurchaseId,
    metadata,
    status,
    providerMessageId,
    errorMessage,
  }: EmailPayload & {
    status: "sent" | "failed" | "skipped";
    providerMessageId?: string | null;
    errorMessage?: string | null;
  }) {
    const logs = supabase.from("email_delivery_logs" as never) as unknown as {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
    };

    const { error } = await logs.insert({
      profile_id: profileId ?? null,
      property_manager_id: propertyManagerId ?? null,
      owner_request_id: ownerRequestId ?? null,
      lead_id: leadId ?? null,
      lead_purchase_id: leadPurchaseId ?? null,
      recipient_email: to,
      event_type: eventType,
      provider: "resend",
      provider_message_id: providerMessageId ?? null,
      subject,
      status,
      error_message: errorMessage ?? null,
      metadata: metadata ?? {},
      sent_at: status === "sent" ? new Date().toISOString() : null,
    });

    if (error) {
      console.warn("Email delivery log not persisted:", error.message);
    }
  }
}

export function getAdminNotificationEmails() {
  return (getEnv("TRANSACTIONAL_ADMIN_EMAILS") ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}
