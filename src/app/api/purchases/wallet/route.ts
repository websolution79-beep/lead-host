import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { sendLeadPurchaseEmail } from "@/lib/email/notifications";

const purchaseSchema = z.object({
  leadId: z.string().uuid(),
  mode: z.enum(["shared", "exclusive"]),
});

type WalletPurchaseResult = {
  lead_id: string;
  lead_title: string;
  purchase_id: string;
  mode: "shared" | "exclusive";
  amount_cents: number;
  balance_cents: number;
  shared_slots_available: number;
  internal_status: string;
  public_status: string;
};

type RpcError = {
  code?: string;
  message?: string;
  details?: string;
};

type WalletPurchaseRpcClient = {
  rpc: (
    fn: "purchase_lead_with_wallet",
    args: {
      p_profile_id: string;
      p_property_manager_id: string;
      p_lead_id: string;
      p_mode: "shared" | "exclusive";
    },
  ) => {
    single: () => Promise<{
      data: WalletPurchaseResult | null;
      error: RpcError | null;
    }>;
  };
};

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile, propertyManager } =
      await requirePropertyManager(request);
    const payload = purchaseSchema.parse(await request.json());
    const rpc = supabase as unknown as WalletPurchaseRpcClient;
    const { data: purchase, error } = await rpc
      .rpc("purchase_lead_with_wallet", {
        p_profile_id: profile.id,
        p_property_manager_id: propertyManager.id,
        p_lead_id: payload.leadId,
        p_mode: payload.mode,
      })
      .single();

    if (error || !purchase) {
      return walletPurchaseErrorResponse(error);
    }

    await sendLeadPurchaseEmail({
      profile: {
        id: profile.id,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        status: profile.status,
      },
      propertyManagerId: propertyManager.id,
      leadPurchaseId: purchase.purchase_id,
      leadId: purchase.lead_id,
      leadTitle: purchase.lead_title,
      mode: purchase.mode,
      amountCents: purchase.amount_cents,
      balanceCents: purchase.balance_cents,
    });

    return NextResponse.json({
      ok: true,
      leadId: purchase.lead_id,
      purchaseId: purchase.purchase_id,
      mode: purchase.mode,
      amountCents: purchase.amount_cents,
      balanceCents: purchase.balance_cents,
      sharedSlotsAvailable: purchase.shared_slots_available,
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

function walletPurchaseErrorResponse(error: RpcError | null) {
  const message = error?.message ?? "";

  if (error?.code === "PGRST202" || message.includes("purchase_lead_with_wallet")) {
    return NextResponse.json(
      {
        error:
          "Database non aggiornato per acquisti wallet atomici. Applica la migration atomic_wallet_purchase e riprova.",
        code: "DATABASE_MIGRATION_REQUIRED",
      },
      { status: 409 },
    );
  }

  if (message.includes("insufficient_credit")) {
    return NextResponse.json(
      {
        error: "Credito insufficiente. Ricarica il wallet per acquistare questo lead.",
        code: "INSUFFICIENT_CREDIT",
        ...parseInsufficientCreditDetails(error?.details),
      },
      { status: 402 },
    );
  }

  if (message.includes("already_purchased") || error?.code === "23505") {
    return NextResponse.json(
      {
        error: "Hai gia acquistato questo lead. Lo trovi in I miei lead.",
        code: "ALREADY_PURCHASED",
      },
      { status: 409 },
    );
  }

  if (message.includes("lead_not_found")) {
    return NextResponse.json(
      { error: "Lead non disponibile nel marketplace.", code: "LEAD_NOT_FOUND" },
      { status: 404 },
    );
  }

  if (
    message.includes("lead_unavailable") ||
    message.includes("exclusive_not_available") ||
    message.includes("shared_slot_not_available")
  ) {
    return NextResponse.json(
      {
        error: "Questo lead non e piu acquistabile.",
        code: "LEAD_NOT_AVAILABLE",
      },
      { status: 409 },
    );
  }

  if (message.includes("property_manager_not_authorized")) {
    return NextResponse.json(
      { error: "Profilo Property Manager non autorizzato.", code: "PM_NOT_AUTHORIZED" },
      { status: 403 },
    );
  }

  if (error?.code === "23514") {
    return NextResponse.json(
      {
        error:
          "Database non aggiornato per prezzi configurabili sugli acquisti. Applica la migration atomic_wallet_purchase e riprova.",
        code: "DATABASE_MIGRATION_REQUIRED",
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { error: "Non e stato possibile acquistare il lead.", code: "PURCHASE_FAILED" },
    { status: 409 },
  );
}

function parseInsufficientCreditDetails(details?: string) {
  if (!details) return {};

  try {
    const parsed = JSON.parse(details) as {
      balance_cents?: number;
      required_amount_cents?: number;
      missing_amount_cents?: number;
    };

    return {
      balanceCents: parsed.balance_cents,
      requiredAmountCents: parsed.required_amount_cents,
      missingAmountCents: parsed.missing_amount_cents,
    };
  } catch {
    return {};
  }
}
