import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type ServiceClient = SupabaseClient<Database>;

export type WalletCouponTier = {
  id?: string;
  minPaidCents: number;
  maxPaidCents: number | null;
  bonusCents: number;
};

export type WalletCouponPreview = {
  couponId: string;
  code: string;
  couponName: string;
  paidAmountCents: number;
  bonusAmountCents: number;
  walletCreditCents: number;
  firstTopUpOnly: boolean;
  validUntil: string | null;
};

export type WalletCouponReservation = WalletCouponPreview & {
  redemptionId: string;
  expiresAt: string;
};

type CouponPreviewRow = {
  coupon_id: string;
  code: string;
  coupon_name: string;
  paid_amount_cents: number;
  bonus_amount_cents: number;
  wallet_credit_cents: number;
  first_top_up_only: boolean;
  valid_until: string | null;
};

type CouponReservationRow = CouponPreviewRow & {
  redemption_id: string;
  expires_at: string;
};

type RpcError = {
  code?: string;
  message?: string;
};

export class WalletCouponError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function normalizeCouponCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function validateCouponTiers(tiers: WalletCouponTier[]) {
  if (!tiers.length) {
    return "Inserisci almeno una fascia bonus.";
  }

  const ordered = [...tiers].sort(
    (left, right) => left.minPaidCents - right.minPaidCents,
  );

  for (const [index, tier] of ordered.entries()) {
    if (
      !Number.isInteger(tier.minPaidCents)
      || tier.minPaidCents <= 0
      || !Number.isInteger(tier.bonusCents)
      || tier.bonusCents <= 0
      || (
        tier.maxPaidCents !== null
        && (
          !Number.isInteger(tier.maxPaidCents)
          || tier.maxPaidCents < tier.minPaidCents
        )
      )
    ) {
      return "Controlla gli importi delle fasce bonus.";
    }

    const previous = ordered[index - 1];

    if (previous) {
      if (previous.maxPaidCents === null) {
        return "Solo l'ultima fascia può non avere un importo massimo.";
      }

      if (tier.minPaidCents <= previous.maxPaidCents) {
        return "Le fasce bonus non possono sovrapporsi.";
      }
    }
  }

  return null;
}

export function resolveCouponTier(
  tiers: WalletCouponTier[],
  paidAmountCents: number,
) {
  return [...tiers]
    .sort((left, right) => right.minPaidCents - left.minPaidCents)
    .find(
      (tier) =>
        tier.minPaidCents <= paidAmountCents
        && (
          tier.maxPaidCents === null
          || paidAmountCents <= tier.maxPaidCents
        ),
    ) ?? null;
}

export async function previewWalletTopUpCoupon({
  supabase,
  profileId,
  code,
  paidAmountCents,
}: {
  supabase: ServiceClient;
  profileId: string;
  code: string;
  paidAmountCents: number;
}) {
  const rpcClient = supabase as unknown as CouponRpcClient;
  const { data, error } = await rpcClient.rpc(
    "preview_wallet_top_up_coupon",
    {
      p_profile_id: profileId,
      p_code: normalizeCouponCode(code),
      p_paid_amount_cents: paidAmountCents,
    },
  );

  if (error || !data?.[0]) {
    throw mapCouponRpcError(error);
  }

  return mapPreview(data[0]);
}

export async function reserveWalletTopUpCoupon({
  supabase,
  profileId,
  walletTransactionId,
  code,
  paidAmountCents,
  expiresAt,
}: {
  supabase: ServiceClient;
  profileId: string;
  walletTransactionId: string;
  code: string;
  paidAmountCents: number;
  expiresAt: string;
}) {
  const rpcClient = supabase as unknown as CouponRpcClient;
  const { data, error } = await rpcClient.rpc(
    "reserve_wallet_top_up_coupon",
    {
      p_profile_id: profileId,
      p_wallet_transaction_id: walletTransactionId,
      p_code: normalizeCouponCode(code),
      p_paid_amount_cents: paidAmountCents,
      p_expires_at: expiresAt,
    },
  );

  if (error || !data?.[0]) {
    throw mapCouponRpcError(error);
  }

  const row = data[0];

  return {
    ...mapPreview(row),
    redemptionId: row.redemption_id,
    expiresAt: row.expires_at,
  } satisfies WalletCouponReservation;
}

export async function cancelWalletTopUpCouponReservation({
  supabase,
  walletTransactionId,
  reason,
}: {
  supabase: ServiceClient;
  walletTransactionId: string;
  reason: string;
}) {
  const rpcClient = supabase as unknown as CouponRpcClient;
  const { error } = await rpcClient.rpc(
    "cancel_wallet_top_up_coupon_reservation",
    {
      p_wallet_transaction_id: walletTransactionId,
      p_reason: reason,
    },
  );

  if (error) throw error;
}

export async function fetchWalletCouponsEnabled(supabase: ServiceClient) {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "wallet.coupons_enabled")
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return false;
    throw error;
  }

  return data?.value === true || data?.value === "true";
}

function mapPreview(row: CouponPreviewRow): WalletCouponPreview {
  return {
    couponId: row.coupon_id,
    code: row.code,
    couponName: row.coupon_name,
    paidAmountCents: row.paid_amount_cents,
    bonusAmountCents: row.bonus_amount_cents,
    walletCreditCents: row.wallet_credit_cents,
    firstTopUpOnly: row.first_top_up_only,
    validUntil: row.valid_until,
  };
}

export function mapCouponRpcError(error: RpcError | null) {
  const source = `${error?.message ?? ""} ${error?.code ?? ""}`.toLowerCase();
  const rules: Array<[string, string, string, number?]> = [
    [
      "coupons_disabled",
      "COUPONS_DISABLED",
      "I coupon non sono attivi in questo momento.",
      409,
    ],
    [
      "coupon_not_found",
      "COUPON_NOT_FOUND",
      "Il codice coupon non è valido o non è attivo.",
    ],
    [
      "coupon_not_started",
      "COUPON_NOT_STARTED",
      "Questo coupon non è ancora utilizzabile.",
    ],
    [
      "coupon_expired",
      "COUPON_EXPIRED",
      "Questo coupon è scaduto.",
    ],
    [
      "coupon_first_top_up_only",
      "COUPON_FIRST_TOP_UP_ONLY",
      "Questo coupon è valido esclusivamente sulla prima ricarica.",
    ],
    [
      "coupon_profile_limit_reached",
      "COUPON_PROFILE_LIMIT_REACHED",
      "Hai già utilizzato questo coupon.",
    ],
    [
      "coupon_total_limit_reached",
      "COUPON_TOTAL_LIMIT_REACHED",
      "Il numero massimo di utilizzi del coupon è stato raggiunto.",
    ],
    [
      "coupon_budget_exhausted",
      "COUPON_BUDGET_EXHAUSTED",
      "Il budget promozionale di questo coupon è terminato.",
    ],
    [
      "coupon_amount_not_eligible",
      "COUPON_AMOUNT_NOT_ELIGIBLE",
      "L'importo scelto non rientra nelle fasce previste dal coupon.",
    ],
    [
      "wallet_coupon_redemptions_pending_profile_unique",
      "COUPON_CHECKOUT_ALREADY_OPEN",
      "Hai già un checkout con coupon in corso. Completalo o attendi la scadenza.",
      409,
    ],
    [
      "coupon_wallet_transaction_invalid",
      "COUPON_TRANSACTION_INVALID",
      "Non è stato possibile collegare il coupon alla ricarica.",
      409,
    ],
  ];
  const match = rules.find(([needle]) => source.includes(needle));

  if (match) {
    return new WalletCouponError(match[1], match[2], match[3] ?? 422);
  }

  return new WalletCouponError(
    "COUPON_NOT_AVAILABLE",
    "Non è stato possibile applicare il coupon. Riprova.",
  );
}

type CouponRpcClient = {
  rpc: {
    (
      fn: "preview_wallet_top_up_coupon",
      args: {
        p_profile_id: string;
        p_code: string;
        p_paid_amount_cents: number;
      },
    ): Promise<{
      data: CouponPreviewRow[] | null;
      error: RpcError | null;
    }>;
    (
      fn: "reserve_wallet_top_up_coupon",
      args: {
        p_profile_id: string;
        p_wallet_transaction_id: string;
        p_code: string;
        p_paid_amount_cents: number;
        p_expires_at: string;
      },
    ): Promise<{
      data: CouponReservationRow[] | null;
      error: RpcError | null;
    }>;
    (
      fn: "cancel_wallet_top_up_coupon_reservation",
      args: {
        p_wallet_transaction_id: string;
        p_reason: string;
      },
    ): Promise<{
      data: unknown;
      error: RpcError | null;
    }>;
  };
};
