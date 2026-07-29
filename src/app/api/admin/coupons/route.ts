import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { getEnv } from "@/lib/env";
import {
  fetchWalletCouponsEnabled,
  normalizeCouponCode,
  validateCouponTiers,
  type WalletCouponTier,
} from "@/lib/wallet/coupons";

const nullableDate = z.string().datetime().nullable();
const tierSchema = z.object({
  minPaidCents: z.number().int().min(100).max(200000),
  maxPaidCents: z.number().int().min(100).max(200000).nullable(),
  bonusCents: z.number().int().min(100).max(200000),
});
const couponSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(3).max(40),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).nullable(),
  partnerName: z.string().trim().max(120).nullable(),
  active: z.boolean(),
  firstTopUpOnly: z.boolean(),
  validFrom: nullableDate,
  validUntil: nullableDate,
  maxTotalRedemptions: z.number().int().min(1).max(1000000).nullable(),
  maxRedemptionsPerProfile: z.number().int().min(1).max(100),
  bonusBudgetCents: z.number().int().min(100).max(100000000).nullable(),
  tiers: z.array(tierSchema).min(1).max(20),
});
const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("toggle_feature"), enabled: z.boolean() }),
  z.object({ action: z.literal("save_coupon"), coupon: couponSchema }),
]);
const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const [couponsEnabled, couponsResult, tiersResult, redemptionsResult] =
      await Promise.all([
        fetchWalletCouponsEnabled(supabase),
        supabase.from("wallet_coupons").select("*").order("created_at", {
          ascending: false,
        }),
        supabase
          .from("wallet_coupon_bonus_tiers")
          .select("*")
          .order("min_paid_cents", { ascending: true }),
        supabase
          .from("wallet_coupon_redemptions")
          .select(
            "id,coupon_id,profile_id,paid_amount_cents,bonus_amount_cents,status,redeemed_at,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(5000),
      ]);

    const storageError =
      couponsResult.error ?? tiersResult.error ?? redemptionsResult.error;

    if (isMissingCouponStorage(storageError)) {
      return NextResponse.json({
        couponsEnabled: false,
        storageReady: false,
        coupons: [],
      });
    }
    if (storageError) throw storageError;

    const tiers = tiersResult.data ?? [];
    const redemptions = redemptionsResult.data ?? [];
    const coupons = (couponsResult.data ?? []).map((coupon) => {
      const couponRedemptions = redemptions.filter(
        (redemption) => redemption.coupon_id === coupon.id,
      );
      const redeemed = couponRedemptions.filter(
        (redemption) => redemption.status === "redeemed",
      );

      return {
        ...coupon,
        tiers: tiers
          .filter((tier) => tier.coupon_id === coupon.id)
          .map((tier) => ({
            id: tier.id,
            minPaidCents: tier.min_paid_cents,
            maxPaidCents: tier.max_paid_cents,
            bonusCents: tier.bonus_cents,
          })),
        stats: {
          redeemedCount: redeemed.length,
          pendingCount: couponRedemptions.filter(
            (redemption) => redemption.status === "pending",
          ).length,
          uniqueProfiles: new Set(
            redeemed.map((redemption) => redemption.profile_id),
          ).size,
          paidAmountCents: redeemed.reduce(
            (total, redemption) => total + redemption.paid_amount_cents,
            0,
          ),
          bonusAmountCents: redeemed.reduce(
            (total, redemption) => total + redemption.bonus_amount_cents,
            0,
          ),
        },
      };
    });

    return NextResponse.json({
      couponsEnabled,
      storageReady: true,
      coupons,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = patchSchema.parse(await request.json());

    if (payload.action === "toggle_feature") {
      const { error } = await supabase.from("settings").upsert(
        {
          key: "wallet.coupons_enabled",
          value: payload.enabled,
          updated_by: profile.id,
        },
        { onConflict: "key" },
      );

      if (error) throw error;

      return NextResponse.json({ ok: true, couponsEnabled: payload.enabled });
    }

    const coupon = payload.coupon;
    const tiersError = validateCouponTiers(coupon.tiers);

    if (tiersError) {
      return NextResponse.json(
        { error: tiersError, code: "INVALID_COUPON_TIERS" },
        { status: 422 },
      );
    }
    if (
      coupon.validFrom
      && coupon.validUntil
      && new Date(coupon.validUntil) <= new Date(coupon.validFrom)
    ) {
      return NextResponse.json(
        {
          error: "La data di fine deve essere successiva alla data di inizio.",
          code: "INVALID_COUPON_DATES",
        },
        { status: 422 },
      );
    }

    const values = {
      code: normalizeCouponCode(coupon.code),
      name: coupon.name,
      description: coupon.description || null,
      partner_name: coupon.partnerName || null,
      active: false,
      first_top_up_only: coupon.firstTopUpOnly,
      valid_from: coupon.validFrom,
      valid_until: coupon.validUntil,
      max_total_redemptions: coupon.maxTotalRedemptions,
      max_redemptions_per_profile: coupon.maxRedemptionsPerProfile,
      bonus_budget_cents: coupon.bonusBudgetCents,
      ...(coupon.id
        ? { updated_by: profile.id }
        : { created_by: profile.id, updated_by: profile.id }),
    };

    let couponId = coupon.id;

    if (couponId) {
      const { error } = await supabase
        .from("wallet_coupons")
        .update(values)
        .eq("id", couponId);

      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("wallet_coupons")
        .insert(values)
        .select("id")
        .single();

      if (error || !data) throw error;
      couponId = data.id;
    }

    const { error: deleteTiersError } = await supabase
      .from("wallet_coupon_bonus_tiers")
      .delete()
      .eq("coupon_id", couponId);

    if (deleteTiersError) throw deleteTiersError;

    const { error: insertTiersError } = await supabase
      .from("wallet_coupon_bonus_tiers")
      .insert(
        coupon.tiers.map((tier: WalletCouponTier) => ({
          coupon_id: couponId!,
          min_paid_cents: tier.minPaidCents,
          max_paid_cents: tier.maxPaidCents,
          bonus_cents: tier.bonusCents,
        })),
      );

    if (insertTiersError) throw insertTiersError;

    const { error: activateError } = await supabase
      .from("wallet_coupons")
      .update({ active: coupon.active })
      .eq("id", couponId);

    if (activateError) throw activateError;

    return NextResponse.json({ ok: true, couponId });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const payload = deleteSchema.parse(await request.json());
    const { data: coupon, error: couponError } = await supabase
      .from("wallet_coupons")
      .select("id,code,name")
      .eq("id", payload.id)
      .maybeSingle();

    if (couponError) throw couponError;
    if (!coupon) {
      return NextResponse.json(
        { error: "Coupon non trovato.", code: "COUPON_NOT_FOUND" },
        { status: 404 },
      );
    }

    const { data: redemptions, error: redemptionsError } = await supabase
      .from("wallet_coupon_redemptions")
      .select(
        "id,status,wallet_transaction_id,provider_checkout_session_id",
      )
      .eq("coupon_id", coupon.id);

    if (redemptionsError) throw redemptionsError;
    if (
      (redemptions ?? []).some(
        (redemption) => redemption.status === "redeemed",
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Questo coupon ha già erogato uno o più bonus e non può essere eliminato. Disattivalo per conservarne la tracciabilità.",
          code: "COUPON_HAS_REDEEMED_BONUSES",
        },
        { status: 409 },
      );
    }

    const pendingRedemptions = (redemptions ?? []).filter(
      (redemption) => redemption.status === "pending",
    );

    if (
      pendingRedemptions.some(
        (redemption) => redemption.provider_checkout_session_id,
      )
    ) {
      const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");

      if (!stripeSecretKey) {
        return NextResponse.json(
          {
            error:
              "Il coupon ha un checkout aperto ma Stripe non è configurato. Riprova dopo aver verificato la configurazione.",
            code: "STRIPE_NOT_CONFIGURED",
          },
          { status: 503 },
        );
      }

      const stripe = new Stripe(stripeSecretKey);

      for (const redemption of pendingRedemptions) {
        const checkoutSessionId = redemption.provider_checkout_session_id;
        if (!checkoutSessionId) continue;

        const session = await stripe.checkout.sessions.retrieve(
          checkoutSessionId,
        );

        if (session.payment_status === "paid" || session.status === "complete") {
          return NextResponse.json(
            {
              error:
                "Un pagamento collegato a questo coupon risulta completato o in fase di registrazione. Attendi l’aggiornamento del Wallet e riprova.",
              code: "COUPON_PAYMENT_COMPLETING",
            },
            { status: 409 },
          );
        }

        if (session.status === "open") {
          await stripe.checkout.sessions.expire(
            checkoutSessionId,
            {},
            {
              idempotencyKey: `delete-wallet-coupon-${coupon.id}-${redemption.id}`,
            },
          );
        }
      }
    }

    const walletTransactionIds = (redemptions ?? []).map(
      (redemption) => redemption.wallet_transaction_id,
    );

    if (walletTransactionIds.length > 0) {
      const { error: cancelTransactionsError } = await supabase
        .from("wallet_transactions")
        .update({ status: "cancelled" })
        .in("id", walletTransactionIds)
        .eq("status", "pending");

      if (cancelTransactionsError) throw cancelTransactionsError;

      const { error: deleteRedemptionsError } = await supabase
        .from("wallet_coupon_redemptions")
        .delete()
        .eq("coupon_id", coupon.id)
        .neq("status", "redeemed");

      if (deleteRedemptionsError) throw deleteRedemptionsError;
    }

    const { error: deleteError } = await supabase
      .from("wallet_coupons")
      .delete()
      .eq("id", coupon.id);

    if (deleteError) throw deleteError;

    return NextResponse.json({
      ok: true,
      deletedCoupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
      },
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function isMissingCouponStorage(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
