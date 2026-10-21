import "server-only";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/service";
import { formatCurrencyCents } from "@/lib/auth/roles";

const contextSchema = z.object({
  eventId: z.string().uuid(), profileId: z.string().uuid(), email: z.string().email(),
  firstName: z.string().nullable(), leadId: z.string().uuid(), purchaseId: z.string().uuid(),
  leadTitle: z.string(), amountCents: z.number().int().positive(), alreadySent: z.boolean(),
});
type Job = { compensation_event_id: string; lease_id: string };

export async function runMarketplacePromotionEmailWorkerSafely(batchSize = 10) {
  try {
    const db = createServiceSupabaseClient();
    const rpc = db as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
    };
    const batch = Number.isFinite(batchSize) ? Math.max(1, Math.min(50, Math.trunc(batchSize))) : 10;
    const claimed = await rpc.rpc("claim_marketplace_promotion_emails", { p_limit: batch });
    if (claimed.error && ["PGRST202", "42883"].includes(claimed.error.code ?? "")) return { storageReady: false };
    if (claimed.error) throw new Error(claimed.error.message ?? "Coda email promozioni non disponibile.");
    const result = { storageReady: true, sent: 0, skipped: 0, failed: 0 };
    for (const job of (claimed.data ?? []) as Job[]) {
      const finish = async (status: string, error: string | null = null) => {
        const completed = await rpc.rpc("finish_marketplace_promotion_email", {
          p_event_id: job.compensation_event_id, p_lease_id: job.lease_id, p_status: status, p_error: error,
        });
        if (completed.error || completed.data !== true) throw new Error(completed.error?.message ?? "Conferma email non registrata.");
      };
      try {
        const checked = await rpc.rpc("get_marketplace_promotion_email_context", {
          p_event_id: job.compensation_event_id, p_lease_id: job.lease_id,
        });
        if (checked.error) throw new Error(checked.error.message ?? "Compenso non verificabile.");
        if (!checked.data) { await finish("skipped", "Compenso non piu notificabile o membro inattivo."); result.skipped++; continue; }
        const context = contextSchema.parse(checked.data);
        if (context.eventId !== job.compensation_event_id) throw new Error("Compenso email non corrispondente.");
        if (context.alreadySent) { await finish("sent"); result.skipped++; continue; }
        // Single recipient: deliberately do not use internal-copy or broadcast helpers.
        const sent = await sendTransactionalEmail({
          eventType: "team.marketplace_promotion_earned", to: context.email,
          idempotencyKey: `marketplace-promotion-earned-${context.eventId}`,
          profileId: context.profileId, leadId: context.leadId, leadPurchaseId: context.purchaseId,
          subject: "", html: "", text: "",
          metadata: { compensation_event_id: context.eventId },
          templateVariables: { member_name: context.firstName?.trim() || "collega", lead_title: context.leadTitle,
            commission_amount: formatCurrencyCents(context.amountCents), purchase_id: context.purchaseId, compensation_event_id: context.eventId },
        });
        if (sent.status === "sent") { await finish("sent"); result.sent++; }
        else if (sent.status === "skipped" && "reason" in sent && sent.reason === "disabled") {
          await finish("skipped", "Template disattivato."); result.skipped++;
        } else { await finish("pending", "Invio non riuscito o configurazione email assente."); result.failed++; }
      } catch (error) {
        result.failed++;
        await finish("pending", error instanceof Error ? error.message : "Errore invio email.").catch(() => {});
      }
    }
    return result;
  } catch (error) {
    console.error("Marketplace promotion email worker failed:", error instanceof Error ? error.message : "Errore sconosciuto.");
    return { storageReady: false, failed: true };
  }
}
