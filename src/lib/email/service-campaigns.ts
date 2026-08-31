import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { appUrl, getEnv } from "@/lib/env";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type ServiceEmailContent = {
  subject: string;
  preview: string;
  title: string;
  body: string;
  extra: string;
  cta_label: string;
  cta_url: string;
};

type ServiceEmailCampaignRow = ServiceEmailContent & {
  id: string;
  status: string;
};

type ServiceEmailRecipientRow = {
  id: string;
  campaign_id: string;
  profile_id: string | null;
  recipient_email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  attempts: number;
  created_at: string;
};

type ResendBatchResponse = {
  data?: Array<{ id?: string }>;
  message?: string;
  name?: string;
};

type ServiceEmailWorkerResult = {
  enabled: boolean;
  claimed: number;
  sent: number;
  retried: number;
  batches: number;
  reason?: string;
};

const MAX_BATCH_SIZE = 100;
const MAX_ATTEMPTS = 5;

export async function sendServiceEmailTest({
  to,
  profileId,
  content,
}: {
  to: string;
  profileId: string;
  content: ServiceEmailContent;
}) {
  const testRecipient: ServiceEmailRecipientRow = {
    id: randomUUID(),
    campaign_id: randomUUID(),
    profile_id: profileId,
    recipient_email: to,
    first_name: "Test",
    last_name: "Admin",
    status: "processing",
    attempts: 1,
    created_at: new Date().toISOString(),
  };
  const result = await deliverBatch({
    campaign: {
      id: testRecipient.campaign_id,
      status: "test",
      ...content,
    },
    recipients: [testRecipient],
    test: true,
  });

  return {
    status: "sent" as const,
    providerMessageId: result[0]?.providerMessageId ?? null,
  };
}

export async function processServiceEmailQueue(
  maxBatches = 5,
  requestedBatchSize = MAX_BATCH_SIZE,
): Promise<ServiceEmailWorkerResult> {
  const apiKey = getEnv("RESEND_API_KEY");
  const from = getEnv("TRANSACTIONAL_EMAIL_FROM");

  if (!apiKey || !from) {
    return {
      enabled: false,
      claimed: 0,
      sent: 0,
      retried: 0,
      batches: 0,
      reason: "missing_configuration",
    };
  }

  const supabase = createServiceSupabaseClient();
  const rpc = createServiceEmailRpc(supabase);
  await rpc.rpc("requeue_stale_service_email_recipients", {});

  const result: ServiceEmailWorkerResult = {
    enabled: true,
    claimed: 0,
    sent: 0,
    retried: 0,
    batches: 0,
  };
  const batchSize = Math.max(
    1,
    Math.min(requestedBatchSize, MAX_BATCH_SIZE),
  );

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    const workerId = `vercel:${randomUUID()}`;
    const claimed = await rpc.rpc("claim_service_email_recipients", {
      p_worker_id: workerId,
      p_batch_size: batchSize,
    });

    if (claimed.error) {
      throw new Error(
        claimed.error.message ?? "Coda email di servizio non disponibile.",
      );
    }

    const recipients = (claimed.data ?? []) as ServiceEmailRecipientRow[];

    if (!recipients.length) break;

    result.claimed += recipients.length;
    result.batches += 1;

    const campaignIds = Array.from(
      new Set(recipients.map((recipient) => recipient.campaign_id)),
    );
    const campaignsResult = await (
      supabase.from("service_email_campaigns" as never) as unknown as {
        select: (columns: string) => {
          in: (
            column: string,
            values: string[],
          ) => Promise<{
            data: ServiceEmailCampaignRow[] | null;
            error: { message?: string } | null;
          }>;
        };
      }
    )
      .select("id,status,subject,preview,title,body,extra,cta_label,cta_url")
      .in("id", campaignIds);

    if (campaignsResult.error) {
      throw new Error(
        campaignsResult.error.message ?? "Campagna email non disponibile.",
      );
    }

    const campaignById = new Map(
      (campaignsResult.data ?? []).map((campaign) => [campaign.id, campaign]),
    );
    const deliverable = recipients.filter((recipient) =>
      campaignById.has(recipient.campaign_id),
    );
    const missingCampaignRecipients = recipients.filter(
      (recipient) => !campaignById.has(recipient.campaign_id),
    );

    if (missingCampaignRecipients.length) {
      await failRecipientGroups({
        recipients: missingCampaignRecipients,
        errorMessage: "Campagna email di servizio non trovata.",
      });
      result.retried += missingCampaignRecipients.length;
    }

    if (!deliverable.length) continue;

    try {
      const deliveries = await deliverMixedBatch({
        recipients: deliverable,
        campaignById,
      });
      const deliveriesByCampaign = groupBy(
        deliveries,
        (delivery) => delivery.recipient.campaign_id,
      );

      for (const [campaignId, campaignDeliveries] of deliveriesByCampaign) {
        const completion = await rpc.rpc("complete_service_email_batch", {
          p_campaign_id: campaignId,
          p_results: campaignDeliveries.map((delivery) => ({
            recipient_id: delivery.recipient.id,
            provider_message_id: delivery.providerMessageId,
          })),
        });

        if (completion.error) {
          throw new Error(
            completion.error.message ?? "Stato campagna non aggiornato.",
          );
        }
      }

      await persistDeliveryLogs(deliveries);
      result.sent += deliveries.length;
    } catch (error) {
      await failRecipientGroups({
        recipients: deliverable,
        errorMessage:
          error instanceof Error ? error.message : "Invio Resend non riuscito.",
      });
      result.retried += deliverable.length;
    }
  }

  return result;
}

export function runServiceEmailWorkerSafely(
  maxBatches = 5,
  batchSize = MAX_BATCH_SIZE,
) {
  return processServiceEmailQueue(maxBatches, batchSize).catch((error) => {
    console.error(
      "Service email worker failed:",
      error instanceof Error ? error.message : "Errore sconosciuto.",
    );
  });
}

async function deliverMixedBatch({
  recipients,
  campaignById,
}: {
  recipients: ServiceEmailRecipientRow[];
  campaignById: Map<string, ServiceEmailCampaignRow>;
}) {
  const messages = recipients.map((recipient) => {
    const campaign = campaignById.get(recipient.campaign_id);

    if (!campaign) {
      throw new Error("Campagna email di servizio non trovata.");
    }

    return {
      campaign,
      recipient,
      rendered: renderServiceEmail(campaign, recipient),
    };
  });
  const apiKey = getEnv("RESEND_API_KEY");
  const from = getEnv("TRANSACTIONAL_EMAIL_FROM");

  if (!apiKey || !from) {
    throw new Error("Configurazione Resend non disponibile.");
  }

  const idempotencyKey = buildBatchIdempotencyKey(recipients);
  const response = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(
      messages.map(({ campaign, recipient, rendered }) => ({
        from,
        reply_to: "info@leadhost.it",
        to: [recipient.recipient_email],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tags: [
          { name: "message_type", value: "service" },
          { name: "campaign_id", value: campaign.id },
        ],
      })),
    ),
  });
  const payload = (await response.json().catch(() => ({}))) as ResendBatchResponse;

  if (!response.ok) {
    throw new Error(
      payload.message ?? payload.name ?? `Resend batch ${response.status}.`,
    );
  }

  if (!payload.data || payload.data.length !== messages.length) {
    throw new Error("Risposta Resend batch incompleta.");
  }

  return messages.map((message, index) => ({
    ...message,
    providerMessageId: payload.data?.[index]?.id ?? null,
  }));
}

async function deliverBatch({
  campaign,
  recipients,
  test,
}: {
  campaign: ServiceEmailCampaignRow;
  recipients: ServiceEmailRecipientRow[];
  test: boolean;
}) {
  const campaignById = new Map([[campaign.id, campaign]]);
  const deliveries = await deliverMixedBatch({ recipients, campaignById });

  if (test) {
    await persistDeliveryLogs(
      deliveries.map((delivery) => ({ ...delivery, test: true })),
    );
  }

  return deliveries;
}

async function failRecipientGroups({
  recipients,
  errorMessage,
}: {
  recipients: ServiceEmailRecipientRow[];
  errorMessage: string;
}) {
  const supabase = createServiceSupabaseClient();
  const rpc = createServiceEmailRpc(supabase);
  const byCampaign = groupBy(recipients, (recipient) => recipient.campaign_id);

  for (const [campaignId, campaignRecipients] of byCampaign) {
    const failure = await rpc.rpc("fail_service_email_batch", {
      p_campaign_id: campaignId,
      p_recipient_ids: campaignRecipients.map((recipient) => recipient.id),
      p_error: errorMessage,
      p_max_attempts: MAX_ATTEMPTS,
    });

    if (failure.error) {
      console.error(
        "Service email failure state not persisted:",
        failure.error.message,
      );
    }
  }
}

async function persistDeliveryLogs(
  deliveries: Array<{
    campaign: ServiceEmailCampaignRow;
    recipient: ServiceEmailRecipientRow;
    rendered: RenderedServiceEmail;
    providerMessageId: string | null;
    test?: boolean;
  }>,
) {
  if (!deliveries.length) return;

  const supabase = createServiceSupabaseClient();
  const logs = supabase.from("email_delivery_logs" as never) as unknown as {
    insert: (
      rows: Array<Record<string, unknown>>,
    ) => Promise<{ error: { message?: string } | null }>;
  };
  const { error } = await logs.insert(
    deliveries.map((delivery) => ({
      profile_id: delivery.recipient.profile_id,
      recipient_email: delivery.recipient.recipient_email,
      event_type: delivery.test
        ? "service.announcement.test"
        : "service.announcement",
      provider: "resend",
      provider_message_id: delivery.providerMessageId,
      subject: delivery.rendered.subject,
      status: "sent",
      metadata: {
        campaign_id: delivery.campaign.id,
        service_communication: true,
        test: delivery.test ?? false,
      },
      sent_at: new Date().toISOString(),
    })),
  );

  if (error) {
    console.warn("Service email logs not persisted:", error.message);
  }
}

function renderServiceEmail(
  content: ServiceEmailContent,
  recipient: Pick<
    ServiceEmailRecipientRow,
    "first_name" | "last_name" | "recipient_email"
  >,
): RenderedServiceEmail {
  const variables = {
    first_name: recipient.first_name ?? "",
    last_name: recipient.last_name ?? "",
    email: recipient.recipient_email,
  };
  const subject = applyVariables(content.subject, variables);
  const preview = applyVariables(content.preview, variables);
  const title = applyVariables(content.title, variables);
  const body = applyVariables(content.body, variables);
  const extra = applyVariables(content.extra, variables);
  const ctaLabel = applyVariables(content.cta_label, variables);
  const ctaUrl = resolveCtaUrl(applyVariables(content.cta_url, variables));

  const html = `<!doctype html>
<html lang="it">
  <body style="margin:0;background:#f7f8fa;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preview)}</div>
    <main style="max-width:640px;margin:0 auto;padding:32px 18px;">
      <section style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;">
        <p style="margin:0 0 18px;color:#047857;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Lead Host</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.15;">${escapeHtml(title)}</h1>
        <p style="margin:0;color:#475569;font-size:16px;line-height:1.7;">${formatEmailText(body)}</p>
        ${extra ? `<p style="margin:18px 0 0;color:#0f172a;font-size:15px;line-height:1.6;font-weight:700;">${formatEmailText(extra)}</p>` : ""}
        ${
          ctaLabel && ctaUrl
            ? `<p style="margin:26px 0 0;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;padding:13px 18px;">${escapeHtml(ctaLabel)}</a></p>`
            : ""
        }
      </section>
      <p style="margin:18px 0 0;text-align:center;color:#94a3b8;font-size:12px;line-height:1.5;">Comunicazione di servizio relativa al tuo account Lead Host.</p>
    </main>
  </body>
</html>`;
  const text = [
    title,
    "",
    body,
    extra,
    ctaLabel && ctaUrl ? `${ctaLabel}: ${ctaUrl}` : "",
    "",
    "Comunicazione di servizio relativa al tuo account Lead Host.",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

type RenderedServiceEmail = {
  subject: string;
  html: string;
  text: string;
};

function createServiceEmailRpc(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
) {
  return supabase as unknown as {
    rpc: (
      fn:
        | "requeue_stale_service_email_recipients"
        | "claim_service_email_recipients"
        | "complete_service_email_batch"
        | "fail_service_email_batch",
      args?: Record<string, unknown>,
    ) => Promise<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  };
}

function buildBatchIdempotencyKey(recipients: ServiceEmailRecipientRow[]) {
  const stableIds = recipients
    .map((recipient) => recipient.id)
    .sort()
    .join(",");
  const hash = createHash("sha256").update(stableIds).digest("hex").slice(0, 32);

  return `lead-host-service-${hash}`;
}

function applyVariables(
  template: string,
  variables: Record<string, string>,
) {
  return template.replace(
    /\{\{\s*(first_name|last_name|email)\s*\}\}/g,
    (_, key: string) => variables[key] ?? "",
  );
}

function resolveCtaUrl(value: string) {
  const cleanValue = value.trim();

  if (!cleanValue) return "";
  if (cleanValue.startsWith("https://") || cleanValue.startsWith("http://")) {
    return cleanValue;
  }

  return cleanValue.startsWith("/")
    ? `${appUrl}${cleanValue}`
    : `${appUrl}/${cleanValue}`;
}

function formatEmailText(value: string) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function groupBy<T>(
  items: T[],
  keySelector: (item: T) => string,
) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = keySelector(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return groups;
}
