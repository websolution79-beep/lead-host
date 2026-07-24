import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { sendLeadPurchaseEmail } from "@/lib/email/notifications";
import { revalidateTag } from "next/cache";
import { MARKETPLACE_LEADS_CACHE_TAG } from "@/lib/cache/tags";
import { CURRENT_TERMS_VERSION } from "@/lib/legal/terms";

const purchaseSchema = z.object({
  leadId: z.string().uuid(),
  mode: z.enum(["shared", "exclusive"]),
  expectedAmountCents: z.number().int().positive(),
  termsAccepted: z.literal(true),
  termsVersion: z.string().trim().min(1),
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
      p_expected_amount_cents: number;
      p_terms_version: string;
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
    const parsedPayload = purchaseSchema.safeParse(
      await request.json().catch(() => null),
    );

    if (!parsedPayload.success) {
      return NextResponse.json(
        {
          error: "Devi accettare le Condizioni del Servizio per acquistare il Lead.",
          code: "TERMS_ACCEPTANCE_REQUIRED",
        },
        { status: 422 },
      );
    }

    const payload = parsedPayload.data;

    if (payload.termsVersion !== CURRENT_TERMS_VERSION) {
      return NextResponse.json(
        {
          error:
            "Le Condizioni del Servizio sono state aggiornate. Rileggile e conferma nuovamente.",
          code: "TERMS_VERSION_CHANGED",
          termsVersion: CURRENT_TERMS_VERSION,
        },
        { status: 409 },
      );
    }

    const rpc = supabase as unknown as WalletPurchaseRpcClient;
    const { data: purchase, error } = await rpc
      .rpc("purchase_lead_with_wallet", {
        p_profile_id: profile.id,
        p_property_manager_id: propertyManager.id,
        p_lead_id: payload.leadId,
        p_mode: payload.mode,
        p_expected_amount_cents: payload.expectedAmountCents,
        p_terms_version: CURRENT_TERMS_VERSION,
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
    revalidateTag(MARKETPLACE_LEADS_CACHE_TAG, "max");

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
          "Database non aggiornato per gli acquisti sicuri. Applica la migration commercial_safety_hardening e riprova.",
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

  if (message.includes("price_changed")) {
    return NextResponse.json(
      {
        error:
          "Il prezzo del Lead è cambiato. Controlla il nuovo importo e conferma nuovamente.",
        code: "PRICE_CHANGED",
        ...parsePriceChangedDetails(error?.details),
      },
      { status: 409 },
    );
  }

  if (message.includes("already_purchased") || error?.code === "23505") {
    return NextResponse.json(
      {
        error: "Hai già acquistato questo lead. Lo trovi in I miei lead.",
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
        error: "Questo lead non è più acquistabile.",
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

  if (message.includes("terms_acceptance_required")) {
    return NextResponse.json(
      {
        error: "Devi accettare le Condizioni del Servizio per acquistare il Lead.",
        code: "TERMS_ACCEPTANCE_REQUIRED",
      },
      { status: 422 },
    );
  }

  if (error?.code === "23514") {
    return NextResponse.json(
      {
        error:
          "Database non aggiornato per gli acquisti sicuri. Applica la migration commercial_safety_hardening e riprova.",
        code: "DATABASE_MIGRATION_REQUIRED",
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { error: "Non è stato possibile acquistare il lead.", code: "PURCHASE_FAILED" },
    { status: 409 },
  );
}

function parsePriceChangedDetails(details?: string) {
  if (!details) return {};

  try {
    const parsed = JSON.parse(details) as {
      expected_amount_cents?: number;
      current_amount_cents?: number;
    };

    return {
      expectedAmountCents: parsed.expected_amount_cents,
      currentAmountCents: parsed.current_amount_cents,
    };
  } catch {
    return {};
  }
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
