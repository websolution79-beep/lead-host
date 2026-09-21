import { createHash } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { sendTransactionalEmail, type EmailEventType } from "@/lib/email/service";
import { MARKETPLACE_MEMBERSHIP_ROLLOUT_READY } from "./settings";

export type MarketplaceEmailNotification =
  | "activation"
  | "payment_received"
  | "cancellation_scheduled"
  | "payment_action_required"
  | "payment_failed";

const marketplaceEmailEvents = {
  activation: {
    customer: "marketplace.activated",
    admin: "admin.marketplace_activated",
  },
  payment_received: {
    customer: "marketplace.payment_received",
    admin: "admin.marketplace_payment_received",
  },
  cancellation_scheduled: {
    customer: "marketplace.cancellation_scheduled",
    admin: "admin.marketplace_cancellation_scheduled",
  },
  payment_action_required: {
    customer: "marketplace.payment_action_required",
    admin: "admin.marketplace_payment_action_required",
  },
  payment_failed: {
    customer: "marketplace.payment_failed",
    admin: "admin.marketplace_payment_failed",
  },
} as const satisfies Record<MarketplaceEmailNotification, Record<"customer" | "admin", EmailEventType>>;

export function marketplaceEmailEventType(
  notification: MarketplaceEmailNotification,
  admin: boolean,
) {
  return marketplaceEmailEvents[notification][admin ? "admin" : "customer"];
}

type MarketplaceEmailOptions = {
  invoiceId?: string;
  cancellationKey?: string;
  notification?: MarketplaceEmailNotification;
};

export async function sendMarketplaceEmails(
  subscriptionId: string,
  { invoiceId, cancellationKey, notification }: MarketplaceEmailOptions = {},
) {
  if (!MARKETPLACE_MEMBERSHIP_ROLLOUT_READY) return;
  const resolvedNotification = notification ?? (cancellationKey
    ? "cancellation_scheduled"
    : invoiceId ? "payment_received" : "activation");
  const db = createServiceSupabaseClient();
  const { data: subscription, error } = await db.from("addon_subscriptions").select("*").eq("id", subscriptionId).single();
  if (error) throw error;
  const { data: product, error: productError } = await db.from("addon_products").select("slug").eq("id", subscription.addon_product_id).single();
  if (productError) throw productError;
  if (product.slug !== "marketplace" || subscription.source !== "stripe") return;
  if (resolvedNotification === "cancellation_scheduled" && (!subscription.cancel_at_period_end || !["trialing", "active"].includes(subscription.status))) return;
  if (resolvedNotification === "activation" && !["trialing", "active"].includes(subscription.status)) return;
  const { data: profile, error: profileError } = await db.from("profiles").select("id,email,first_name,last_name,status").eq("id", subscription.profile_id).single();
  if (profileError) throw profileError;
  const { data: payment, error: paymentError } = invoiceId
    ? await db.from("addon_payments").select("amount_cents,currency,status,billing_period_ends_at")
      .eq("subscription_id", subscriptionId).eq("provider_invoice_id", invoiceId).eq("provider", "stripe").single()
    : { data: null, error: null };
  if (paymentError) throw paymentError;
  if (resolvedNotification === "payment_received" && (!payment || payment.status !== "paid" || payment.amount_cents <= 0)) return;
  if (resolvedNotification === "payment_action_required" && (!payment || payment.status !== "pending" || payment.amount_cents <= 0)) return;
  if (resolvedNotification === "payment_failed" && (!payment || !["failed", "uncollectible"].includes(payment.status) || payment.amount_cents <= 0)) return;
  const metadata = subscription.metadata && typeof subscription.metadata === "object" && !Array.isArray(subscription.metadata) ? subscription.metadata : {};
  const money = (value: number, currency = "EUR") => new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value / 100);
  const date = (value: string | null) => value ? new Date(value).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "non prevista";
  const variables = {
    customer_name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email,
    customer_email: profile.email, subscription_id: subscriptionId,
    subscription_status: subscription.status === "trialing" ? "prova gratuita" : "attivo",
    monthly_price: typeof metadata.monthly_price_cents === "number" ? money(metadata.monthly_price_cents) : "non disponibile",
    trial_end: date(subscription.trial_ends_at), paid_amount: payment ? money(payment.amount_cents, payment.currency) : "",
    period_end: date(payment?.billing_period_ends_at ?? subscription.current_period_ends_at),
    renewal_terms: subscription.cancel_at_period_end ? "I rinnovi futuri sono disattivati." : "Il rinnovo mensile e automatico, salvo disdetta dal profilo prima della scadenza.",
  };
  const { data: roles, error: roleError } = await db.from("user_roles").select("profile_id").eq("role", "super_admin");
  if (roleError) throw roleError;
  const { data: admins, error: adminError } = roles?.length
    ? await db.from("profiles").select("id,email").in("id", roles.map(r => r.profile_id)).eq("status", "active")
    : { data: [], error: null };
  if (adminError) throw adminError;
  if (!admins?.length) throw new Error("Nessun Super Admin attivo per la notifica Marketplace.");
  const recipients = [
    ...(profile.status === "active" ? [{ ...profile, admin: false }] : []),
    ...admins.map(admin => ({ ...admin, admin: true })),
  ];
  for (const recipient of recipients) {
    const eventType = marketplaceEmailEventType(resolvedNotification, recipient.admin);
    const deliveryReference = resolvedNotification === "cancellation_scheduled"
      ? `${subscriptionId}:${cancellationKey}`
      : invoiceId ?? subscriptionId;
    const key = createHash("sha256").update(`${eventType}:${deliveryReference}:${recipient.email.toLowerCase()}`).digest("hex");
    const { data: sent, error: logError } = await db.from("email_delivery_logs").select("id")
      .eq("event_type", eventType).eq("status", "sent").contains("metadata", { marketplace_email_key: key }).limit(1);
    if (logError) throw logError;
    if (sent?.length) continue;
    const result = await sendTransactionalEmail({ to: recipient.email, profileId: recipient.id, eventType,
      idempotencyKey: `marketplace-${key}`, metadata: { marketplace_email_key: key, addon_subscription_id: subscriptionId, stripe_invoice_id: invoiceId ?? null },
      templateVariables: variables, subject: "", html: "", text: "" });
    if (result.status === "failed" || (result.status === "skipped" && !("reason" in result && result.reason === "disabled"))) {
      throw new Error("Invio email Marketplace non completato: riprovare.");
    }
  }
}
