import Stripe from "stripe";
import { getEnv } from "@/lib/env";

const requiredWebhookEvents: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.voided",
  "invoice.marked_uncollectible",
];

export async function ensureStripeAddonInfrastructure(appUrl: string) {
  const secretKey = getEnv("STRIPE_SECRET_KEY");
  if (!secretKey) throw new Error("Stripe non configurato sul server.");

  const stripe = new Stripe(secretKey);
  const [portalConfigurationId, webhook] = await Promise.all([
    getOrCreateStripePortalConfiguration(stripe, appUrl),
    ensureStripeWebhookEvents(stripe, appUrl),
  ]);

  return { portalConfigurationId, webhook };
}

export async function getOrCreateStripePortalConfiguration(
  stripe: Stripe,
  appUrl: string,
) {
  const configurations = await stripe.billingPortal.configurations.list({
    active: true,
    limit: 100,
  });
  const existing = configurations.data.find(
    (configuration) =>
      configuration.metadata?.managed_by === "leadhost" &&
      configuration.metadata?.addon_slug === "marketing",
  );
  if (existing) return existing.id;

  const normalizedAppUrl = appUrl.replace(/\/+$/, "");
  const configuration = await stripe.billingPortal.configurations.create({
    name: "Lead Host - Modulo Marketing",
    default_return_url: `${normalizedAppUrl}/app/profilo#abbonamento-marketing`,
    business_profile: {
      headline: "Gestisci il tuo abbonamento Lead Host",
      privacy_policy_url: "https://www.iubenda.com/privacy-policy/12644511",
      terms_of_service_url: `${normalizedAppUrl}/termini`,
    },
    features: {
      customer_update: {
        enabled: true,
        allowed_updates: ["address", "name", "phone", "tax_id"],
      },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: false },
    },
    metadata: {
      managed_by: "leadhost",
      addon_slug: "marketing",
    },
  });
  return configuration.id;
}

async function ensureStripeWebhookEvents(stripe: Stripe, appUrl: string) {
  const targetUrl = `${appUrl.replace(/\/+$/, "")}/api/webhooks/stripe`;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const endpoint = endpoints.data.find(
    (candidate) => normalizeUrl(candidate.url) === normalizeUrl(targetUrl),
  );

  if (!endpoint) {
    return { found: false, updated: false, endpointId: null };
  }
  if (endpoint.enabled_events.includes("*")) {
    return { found: true, updated: false, endpointId: endpoint.id };
  }

  const enabledEvents = Array.from(
    new Set([...endpoint.enabled_events, ...requiredWebhookEvents]),
  ) as Stripe.WebhookEndpointUpdateParams.EnabledEvent[];
  const changed = enabledEvents.length !== endpoint.enabled_events.length;
  if (changed) {
    await stripe.webhookEndpoints.update(endpoint.id, {
      enabled_events: enabledEvents,
    });
  }

  return { found: true, updated: changed, endpointId: endpoint.id };
}

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}
