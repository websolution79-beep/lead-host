import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getMarketingAddonAdminOverview } from "@/lib/addons/admin";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";

const nullableUrl = z.union([z.literal(""), z.string().trim().url().max(1000)]);
const nullableStripeId = (prefix: string) =>
  z.union([
    z.literal(""),
    z.string().trim().regex(new RegExp(`^${prefix}_[A-Za-z0-9]+$`)).max(255),
  ]);

const addonProductSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    shortDescription: z.string().trim().max(300),
    description: z.string().trim().max(5000),
    status: z.enum(["draft", "active", "inactive"]),
    isMenuVisible: z.boolean(),
    checkoutEnabled: z.boolean(),
    trialDays: z.number().int().min(0).max(365),
    listPriceCents: z.number().int().min(0).max(1000000).nullable(),
    salePriceCents: z.number().int().min(1).max(1000000).nullable(),
    gracePeriodDays: z.number().int().min(0).max(30),
    cancellationMode: z.enum(["period_end", "immediate"]),
    stripeProductId: nullableStripeId("prod"),
    stripePriceId: nullableStripeId("price"),
    coverImageUrl: nullableUrl,
    videoUrl: nullableUrl,
    features: z.array(z.string().trim().min(2).max(180)).max(20),
    termsUrl: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .refine((value) => value.startsWith("/") || URL.canParse(value), {
        message: "Inserisci un percorso interno o un URL valido.",
      }),
  })
  .superRefine((value, context) => {
    if (
      value.listPriceCents !== null &&
      value.salePriceCents !== null &&
      value.listPriceCents < value.salePriceCents
    ) {
      context.addIssue({
        code: "custom",
        path: ["listPriceCents"],
        message: "Il prezzo di listino non può essere inferiore al prezzo di vendita.",
      });
    }

    if (
      value.checkoutEnabled &&
      (value.status !== "active" ||
        !value.salePriceCents ||
        !value.stripeProductId ||
        !value.stripePriceId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["checkoutEnabled"],
        message:
          "Per attivare il checkout servono stato attivo, prezzo di vendita e ID Stripe.",
      });
    }
  });

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const overview = await getMarketingAddonAdminOverview(supabase);

    return NextResponse.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    const previous = await getMarketingAddonAdminOverview(supabase);
    const payload = addonProductSchema.parse(await request.json());

    const { data: savedProduct, error } = await supabase
      .from("addon_products")
      .update({
        name: payload.name,
        short_description: payload.shortDescription || null,
        description: payload.description || null,
        status: payload.status,
        is_menu_visible: payload.isMenuVisible,
        checkout_enabled: payload.checkoutEnabled,
        trial_days: payload.trialDays,
        list_price_cents: payload.listPriceCents,
        sale_price_cents: payload.salePriceCents,
        grace_period_days: payload.gracePeriodDays,
        cancellation_mode: payload.cancellationMode,
        stripe_product_id: payload.stripeProductId || null,
        stripe_price_id: payload.stripePriceId || null,
        cover_image_url: payload.coverImageUrl || null,
        video_url: payload.videoUrl || null,
        features: payload.features,
        terms_url: payload.termsUrl,
        updated_by: profile.id,
      })
      .eq("slug", "marketing")
      .select("id")
      .single();

    if (error || !savedProduct) {
      throw new Error(error?.message ?? "Addon Marketing non trovato.");
    }

    const updated = await getMarketingAddonAdminOverview(supabase);

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "addon_product",
      entityId: updated.product.id,
      action: "addon.marketing_updated",
      before: previous.product,
      after: updated.product,
    });

    return NextResponse.json({ ok: true, ...updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Configurazione non valida." },
        { status: 422 },
      );
    }

    return adminApiErrorResponse(error);
  }
}
