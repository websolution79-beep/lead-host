import { bookingCallEmailContextSchema } from "./contracts";

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type BookingMail = {
  eventType: "team.booking_call_requested" | "lead.booking_call_purchased";
  to: string; profileId: string; leadPurchaseId: string; leadId: string; ownerRequestId: string;
  idempotencyKey: string; metadata: { booking_call_id: string }; templateVariables: Record<string, string | number>;
  subject: string; html: string; text: string;
};
type Dependencies = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
  send: (payload: BookingMail) => Promise<{ status: string; reason?: string }>;
  wasSent: (purchaseId: string, eventType: BookingMail["eventType"], recipient: string) => Promise<boolean>;
  notifyAdmin: (context: ReturnType<typeof bookingCallEmailContextSchema.parse>) => Promise<unknown>;
};
const euro = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
const fullName = (contact: { firstName: string | null; lastName: string | null }) => [contact.firstName, contact.lastName].filter(Boolean).join(" ");

export async function processBookingCallEmails(deps: Dependencies, limit = 1, bookingCallId?: string) {
  const result = { storageReady: true, sent: 0, skipped: 0, failed: 0 };
  const count = Number.isFinite(limit) ? Math.max(1, Math.min(3, Math.trunc(limit))) : 1;
  for (let index = 0; index < count; index++) {
    const claimed = await deps.rpc("claim_booking_call_emails", { p_limit: 1, p_booking_call_id: bookingCallId ?? null });
    if (claimed.error && ["PGRST202", "42883"].includes(claimed.error.code ?? "")) return { ...result, storageReady: false };
    if (claimed.error) throw new Error("Coda email booking non disponibile.");
    const job = (claimed.data as { booking_call_id: string; lease_id: string }[] | null)?.[0];
    if (!job) break;
    const finish = async (status: string, error: string | null = null) => {
      const ended = await deps.rpc("finish_booking_call_email", { p_booking_call_id: job.booking_call_id, p_lease_id: job.lease_id, p_status: status, p_error: error });
      if (ended.error) throw new Error("Conferma invio booking non disponibile.");
      return ended.data === true;
    };
    const read = async () => {
      const checked = await deps.rpc("get_booking_call_email_context", { p_booking_call_id: job.booking_call_id, p_lease_id: job.lease_id });
      if (checked.error) throw new Error("Contesto email booking non disponibile.");
      if (!checked.data) return null;
      const parsed = bookingCallEmailContextSchema.safeParse(checked.data);
      if (!parsed.success || parsed.data.id !== job.booking_call_id) throw new Error("Contesto email booking non valido.");
      return parsed.data;
    };
    try {
      let context = await read();
      if (!context || context.status === "refunded") { await finish("pending", "Contesto terminato o lease scaduto."); result.skipped++; continue; }
      const variables = {
        booking_call_id: context.id, purchase_id: context.purchaseId, lead_title: context.leadTitle, city: context.city ?? "",
        owner_name: fullName(context.owner), owner_email: context.owner.email ?? "", owner_phone: context.owner.phone ?? "", owner_address: context.owner.address ?? "",
        property_manager_name: fullName(context.buyer), property_manager_email: context.buyer.email, property_manager_phone: context.buyer.phone ?? "",
        lead_amount: euro(context.leadAmountCents), booking_fee: euro(context.bookingFeeCents), amount: euro(context.totalAmountCents),
        commission_amount: euro(context.compensationCents), wallet_balance: euro(context.balanceCents),
        commission_notice: context.needsAttribution
          ? "Compenso booking da attribuire: 3,00 €. Verifica il qualificatore nella sezione Team."
          : "Compenso booking maturato dal qualificatore all'acquisto: 3,00 €.",
      };
      const send = async (eventType: BookingMail["eventType"], recipient: { profileId: string; email: string; firstName: string | null }) => {
        if (await deps.wasSent(context!.purchaseId, eventType, recipient.email)) return;
        const sent = await deps.send({ eventType, to: recipient.email, profileId: recipient.profileId,
          leadPurchaseId: context!.purchaseId, leadId: context!.leadId, ownerRequestId: context!.ownerRequestId,
          idempotencyKey: `booking-${eventType}-${context!.id}-${recipient.profileId}`, metadata: { booking_call_id: context!.id },
          templateVariables: { ...variables, member_name: recipient.firstName ?? "collega" }, subject: "", html: "", text: "" });
        if (sent.status !== "sent" && !(sent.status === "skipped" && sent.reason === "disabled")) throw new Error("Invio booking non riuscito o mittente non configurato.");
      };
      await send("lead.booking_call_purchased", context.buyer);
      context = await read();
      if (!context || context.status === "refunded") { await finish("pending", "Booking terminato durante l'invio."); result.skipped++; continue; }
      if (!context.recipients.length) throw new Error("Nessun destinatario Team/Admin attivo per il booking.");
      for (const recipient of context.recipients) {
        const current = await read();
        if (!current || current.status === "refunded") throw new Error("Destinatario o lease booking aggiornato durante l'invio.");
        await send("team.booking_call_requested", recipient);
      }
      await deps.notifyAdmin(context).catch(() => undefined);
      if (await finish("sent")) result.sent++; else result.skipped++;
    } catch (error) {
      result.failed++;
      await finish("pending", error instanceof Error ? error.message : "Invio booking non riuscito.").catch(() => undefined);
    }
  }
  return result;
}
