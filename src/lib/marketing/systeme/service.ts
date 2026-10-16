import { z } from "zod";
import { requireEnv } from "@/lib/env";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { decryptSystemeSecret } from "./crypto";
import type { SystemeWebhookDependencies } from "./webhook";
import { dispatchSystemeImport } from "./flow-dispatch";
import { systemeFlowSnapshotSchema } from "./flows";

const importResultSchema = z.object({
  status: z.enum(["imported", "updated", "ignored", "failed", "duplicate", "conflict", "stale_secret", "not_found"]),
  reason: z.string().nullish(),
  retryable: z.boolean().optional(),
});

export function createSystemeWebhookDependencies(): SystemeWebhookDependencies {
  const supabase = createServiceSupabaseClient();
  return {
    async loadSigningSecret(integrationId) {
      const { data, error } = await supabase.from("marketing_systeme_webhook_secrets")
        .select("encrypted_secret,rotated_at").eq("integration_id", integrationId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        secret: decryptSystemeSecret(data.encrypted_secret, integrationId, requireEnv("MARKETING_INTEGRATIONS_ENCRYPTION_KEY")),
        rotatedAt: data.rotated_at,
      };
    },
    async importEvent(event) {
      const importLegacy = async () => {
        const { data, error } = await supabase.rpc("import_marketing_systeme_opt_in", {
          p_integration_id: event.integrationId,
          p_secret_rotated_at: event.secretRotatedAt,
          p_message_id: event.messageId,
          p_event_type: event.eventType,
          p_payload_sha256: event.payloadSha256,
          p_event_occurred_at: event.eventOccurredAt,
          p_source_page_url: event.sourcePageUrl,
          p_contact: event.contact,
          p_rejection_reason: event.rejectionReason,
        });
        if (error) throw error;
        return importResultSchema.parse(data);
      };
      const connection = await supabase.from("marketing_systeme_integrations").select("profile_id,routing_mode")
        .eq("id", event.integrationId).maybeSingle();
      if (connection.error) throw connection.error;
      if (!connection.data) return { status: "not_found" };
      // Existing connections need no new RPC until they are explicitly migrated to flows mode.
      if (connection.data.routing_mode === "legacy") return importLegacy();
      const profileId = connection.data.profile_id;
      return dispatchSystemeImport(event, {
        importLegacy,
        async loadSnapshot() {
          const snapshot = await supabase.rpc("marketing_systeme_flow_snapshot", { p_integration_id: event.integrationId, p_profile_id: profileId });
          if (snapshot.error) throw snapshot.error;
          return systemeFlowSnapshotSchema.parse(snapshot.data);
        },
        async importFlow(input) {
          const result = await supabase.rpc("import_marketing_systeme_flow_opt_in", {
            p_integration_id: event.integrationId, p_secret_rotated_at: event.secretRotatedAt,
            p_configuration_token: input.configurationToken, p_message_id: event.messageId,
            p_event_type: event.eventType, p_payload_sha256: event.payloadSha256, p_event_occurred_at: event.eventOccurredAt,
            p_source_page_url: input.sourcePageUrl, p_flow_id: input.flowId, p_contact: input.contact,
            p_additional_answers: input.additionalAnswers, p_warnings: input.warnings,
            p_discovered_fields: input.discoveredFields, p_rejection_reason: input.rejectionReason,
          });
          if (result.error) throw result.error;
          return importResultSchema.parse(result.data);
        },
      });
    },
    onError() {
      console.error("Systeme.io webhook processing temporarily unavailable.");
    },
  };
}
