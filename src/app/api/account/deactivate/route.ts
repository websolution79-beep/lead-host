import { after, NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  getClearSessionCookieOptions,
} from "@/lib/auth/session-cookies";
import {
  PropertyManagerApiError,
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { runBrevoWorkerSafely } from "@/lib/brevo/worker";
import { MARKETING_CONSENT_POLICY_VERSION } from "@/lib/brevo/config";
import { sendTransactionalEmail } from "@/lib/email/service";
import { getEnv } from "@/lib/env";

const payloadSchema = z.object({
  confirmation: z.literal("DISATTIVA ACCOUNT"),
  reason: z.string().trim().max(500).optional().default(""),
});

const renewableStatusValues = [
  "trialing",
  "active",
  "past_due",
  "paused",
  "unpaid",
] as const;
const renewableStatuses = new Set<string>(renewableStatusValues);

type RenewalBlocker = {
  slug: "marketing" | "lead-host-prime";
  name: string;
  status: string;
  manageHref: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const blockers = await loadRenewalBlockers(supabase, profile.id);

    return NextResponse.json({
      ok: true,
      canDeactivate: blockers.length === 0,
      blockers,
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile, propertyManager } = await requirePropertyManager(request);
    const parsed = payloadSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      throw new PropertyManagerApiError(
        422,
        'Scrivi "DISATTIVA ACCOUNT" per confermare la disattivazione.',
      );
    }

    const blockers = await loadRenewalBlockers(supabase, profile.id);
    if (blockers.length) {
      return NextResponse.json(
        {
          error:
            "Prima di disattivare l’account devi annullare i rinnovi automatici degli abbonamenti attivi.",
          code: "ACTIVE_SUBSCRIPTIONS",
          blockers,
        },
        { status: 409 },
      );
    }

    const evidence = {
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: request.headers.get("user-agent")?.slice(0, 1000) ?? null,
    };
    const { data: deactivatedAt, error: deactivationError } = await supabase.rpc(
      "self_deactivate_property_manager",
      {
        p_profile_id: profile.id,
        p_reason: parsed.data.reason || null,
        p_policy_version: MARKETING_CONSENT_POLICY_VERSION,
        p_evidence: evidence,
      },
    );

    if (deactivationError || !deactivatedAt) {
      console.error("PM self deactivation failed:", deactivationError);
      throw new PropertyManagerApiError(
        500,
        "Non sono riuscito a disattivare l’account. Riprova tra poco.",
      );
    }

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin: false,
      actorRole: "property_manager",
      entityType: "property_manager_account",
      entityId: propertyManager.id,
      action: "self_deactivated",
      before: { status: "active", verificationStatus: propertyManager.verification_status },
      after: { status: "suspended", verificationStatus: "suspended", deactivatedAt },
    });

    const firstNameSuffix = profile.first_name ? `, ${profile.first_name}` : "";
    after(async () => {
      await Promise.allSettled([
        sendTransactionalEmail({
          to: profile.email,
          eventType: "pm.account_deactivated",
          profileId: profile.id,
          propertyManagerId: propertyManager.id,
          subject: "",
          html: "",
          text: "",
          metadata: { source: "profile_self_service" },
          templateVariables: {
            first_name: profile.first_name,
            first_name_suffix: firstNameSuffix,
            deactivated_at: new Intl.DateTimeFormat("it-IT", {
              dateStyle: "long",
              timeStyle: "short",
              timeZone: "Europe/Rome",
            }).format(new Date(deactivatedAt)),
          },
        }),
        runBrevoWorkerSafely(10),
      ]);
    });

    const response = NextResponse.json({
      ok: true,
      deactivatedAt,
      message: "Account disattivato con successo.",
    });
    response.cookies.set(ACCESS_TOKEN_COOKIE, "", getClearSessionCookieOptions());
    response.cookies.set(REFRESH_TOKEN_COOKIE, "", getClearSessionCookieOptions());
    return response;
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

async function loadRenewalBlockers(
  supabase: Awaited<ReturnType<typeof requirePropertyManager>>["supabase"],
  profileId: string,
) {
  const { data: products, error: productsError } = await supabase
    .from("addon_products")
    .select("id,slug,name")
    .in("slug", ["marketing", "lead-host-prime"]);
  if (productsError) throw productsError;
  if (!products?.length) return [];

  const productById = new Map(products.map((product) => [product.id, product]));
  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("addon_subscriptions")
    .select(
      "id,addon_product_id,status,source,stripe_subscription_id,cancel_at_period_end,updated_at",
    )
    .eq("profile_id", profileId)
    .in("addon_product_id", products.map((product) => product.id))
    .in("status", renewableStatusValues)
    .order("updated_at", { ascending: false });
  if (subscriptionsError) throw subscriptionsError;

  const candidates = (subscriptions ?? []).filter(
    (subscription) =>
      subscription.source === "stripe" && renewableStatuses.has(subscription.status),
  );
  if (!candidates.length) return [];

  const stripeKey = getEnv("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    throw new PropertyManagerApiError(
      503,
      "Non riesco a verificare gli abbonamenti in questo momento. Riprova tra poco.",
    );
  }

  const stripe = new Stripe(stripeKey);
  const blockersBySlug = new Map<string, RenewalBlocker>();

  for (const candidate of candidates) {
    const product = productById.get(candidate.addon_product_id);
    if (!product || blockersBySlug.has(product.slug)) continue;

    let isRenewing = !candidate.cancel_at_period_end;
    let currentStatus: string = candidate.status;

    if (candidate.stripe_subscription_id) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(
          candidate.stripe_subscription_id,
        );
        currentStatus = stripeSubscription.status;
        isRenewing =
          renewableStatuses.has(stripeSubscription.status) &&
          !stripeSubscription.cancel_at_period_end;
      } catch (error) {
        if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing") {
          isRenewing = false;
        } else {
          console.error("Stripe subscription verification failed:", error);
          throw new PropertyManagerApiError(
            503,
            "Non riesco a verificare gli abbonamenti in questo momento. Riprova tra poco.",
          );
        }
      }
    }

    if (!isRenewing) continue;
    const slug = product.slug as RenewalBlocker["slug"];
    blockersBySlug.set(slug, {
      slug,
      name: product.name,
      status: currentStatus,
      manageHref:
        slug === "marketing"
          ? "/app/profilo#abbonamento-marketing"
          : "/app/profilo#abbonamento-prime",
    });
  }

  return Array.from(blockersBySlug.values());
}
