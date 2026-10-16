import { z } from "zod";
import { systemePayloadHash, verifySystemeSignature } from "./crypto";
import { parseSystemeOptIn, type SystemeContactInput } from "./payload";
import { parseSystemeFlowEnvelope, type SystemeFlowEnvelope } from "./flow-payload";

const maxBodyBytes = 256 * 1024;
const messageIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,160}$/);
const eventTypeSchema = z.string().regex(/^[A-Z_]{1,80}$/);

export type SystemeImportEvent = {
  integrationId: string;
  secretRotatedAt: string;
  messageId: string;
  eventType: string;
  payloadSha256: string;
  eventOccurredAt: string | null;
  sourcePageUrl: string | null;
  contact: SystemeContactInput | null;
  rejectionReason: string | null;
  flowEnvelope: SystemeFlowEnvelope | null;
  protocolRejectionReason: "unsupported_schema" | "unsupported_event" | null;
};

export type SystemeImportResult = {
  status: "imported" | "updated" | "ignored" | "failed" | "duplicate" | "conflict" | "stale_secret" | "not_found";
  reason?: string | null;
  retryable?: boolean;
};

export type SystemeWebhookDependencies = {
  loadSigningSecret: (integrationId: string) => Promise<{ secret: string; rotatedAt: string } | null>;
  importEvent: (event: SystemeImportEvent) => Promise<SystemeImportResult>;
  onError: () => void;
};

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function readLimitedBody(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBodyBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } finally {
    reader.releaseLock();
  }
}

export async function handleSystemeWebhook(
  request: Request,
  integrationId: string,
  dependencies: SystemeWebhookDependencies,
) {
  if (!z.string().uuid().safeParse(integrationId).success) return reply(404, { error: "Webhook non trovato." });
  const signature = request.headers.get("x-webhook-signature") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(signature)) return reply(401, { error: "Firma non valida." });
  const messageId = messageIdSchema.safeParse(request.headers.get("x-webhook-message-id"));
  const eventType = eventTypeSchema.safeParse(request.headers.get("x-webhook-event"));
  if (!messageId.success || !eventType.success) return reply(400, { error: "Intestazioni webhook non valide." });

  let rawBody: string | null;
  try { rawBody = await readLimitedBody(request); } catch { return reply(400, { error: "Corpo webhook non valido." }); }
  if (rawBody === null) return reply(413, { error: "Webhook troppo grande." });

  try {
    const signing = await dependencies.loadSigningSecret(integrationId);
    if (!signing) return reply(404, { error: "Webhook non trovato." });
    if (!verifySystemeSignature(rawBody, signature, signing.secret)) return reply(401, { error: "Firma non valida." });

    const schemaVersion = request.headers.get("x-webhook-schema-version");
    const parsed = parseSystemeOptIn(rawBody);
    const occurredAt = request.headers.get("x-webhook-event-timestamp");
    const timestamp = occurredAt && z.string().datetime({ offset: true }).safeParse(occurredAt).success
      ? new Date(occurredAt).toISOString() : null;
    const result = await dependencies.importEvent({
      integrationId,
      secretRotatedAt: signing.rotatedAt,
      messageId: messageId.data,
      eventType: eventType.data,
      payloadSha256: systemePayloadHash(rawBody),
      eventOccurredAt: timestamp,
      sourcePageUrl: parsed.sourcePageUrl,
      contact: parsed.contact,
      flowEnvelope: parseSystemeFlowEnvelope(rawBody),
      protocolRejectionReason: schemaVersion !== "1" ? "unsupported_schema" : eventType.data !== "CONTACT_OPT_IN" ? "unsupported_event" : null,
      rejectionReason: schemaVersion !== "1" ? "unsupported_schema"
        : eventType.data !== "CONTACT_OPT_IN" ? "unsupported_event" : parsed.rejectionReason,
    });
    if (result.status === "not_found") return reply(404, { error: "Webhook non trovato." });
    if (result.status === "stale_secret") return reply(401, { error: "Firma non valida." });
    if (result.status === "conflict") return reply(409, { error: "Identificativo webhook gia utilizzato." });
    if (result.retryable) return reply(503, { error: "Importazione temporaneamente non disponibile." });
    return reply(200, { ok: true, status: result.status });
  } catch {
    dependencies.onError();
    return reply(503, { error: "Importazione temporaneamente non disponibile." });
  }
}
