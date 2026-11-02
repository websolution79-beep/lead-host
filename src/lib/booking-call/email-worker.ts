import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/service";
import { sendAdminLeadPurchaseEmail } from "@/lib/email/notifications";
import { processBookingCallEmails } from "./email-delivery";

type DeliveryLogQuery = {
  eq: (key: string, value: string) => DeliveryLogQuery;
  limit: (n: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
};

export async function runBookingCallEmailWorkerSafely(limit = 1, bookingCallId?: string) {
  try {
    const db = createServiceSupabaseClient();
    const rpc = db as unknown as { rpc: Parameters<typeof processBookingCallEmails>[0]["rpc"] };
    return await processBookingCallEmails({
      rpc: (name, args) => rpc.rpc(name, args), send: sendTransactionalEmail,
      wasSent: async (purchaseId, eventType, email) => {
        const logs = db.from("email_delivery_logs" as never) as unknown as {
          select: (fields: string) => { eq: (key: string, value: string) => unknown };
        };
        const query = logs.select("id") as unknown as DeliveryLogQuery;
        const checked = await query.eq("lead_purchase_id", purchaseId).eq("event_type", eventType).eq("recipient_email", email).eq("status", "sent").limit(1);
        if (checked.error) throw new Error("Verifica invii booking non disponibile.");
        return Boolean(checked.data?.length);
      },
      notifyAdmin: context => sendAdminLeadPurchaseEmail({
        profile: { id: context.buyer.profileId, email: context.buyer.email, first_name: context.buyer.firstName, last_name: context.buyer.lastName, status: "active" },
        propertyManagerId: context.propertyManagerId, leadPurchaseId: context.purchaseId, leadId: context.leadId, leadTitle: context.leadTitle,
        mode: "exclusive", amountCents: context.totalAmountCents, balanceCents: context.balanceCents, bookingCall: true,
      }),
    }, limit, bookingCallId);
  } catch (error) {
    console.error("Booking email worker failed:", error instanceof Error ? error.message : "Errore sconosciuto.");
    return { storageReady: false, failed: 1 };
  }
}
