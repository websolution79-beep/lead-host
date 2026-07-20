import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import {
  getVisibleSharedSlotsAvailable,
  isExclusiveAvailable,
  isSharedAvailable,
  parseLeadDate,
  type PurchaseMode,
} from "@/lib/domain/lead-state";

const purchaseSchema = z.object({
  leadId: z.string().uuid(),
  mode: z.enum(["shared", "exclusive"]),
});

type WalletRow = {
  id: string;
  profile_id: string;
  balance_cents: number;
  currency: string;
};

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile, propertyManager } =
      await requirePropertyManager(request);
    const payload = purchaseSchema.parse(await request.json());
    const now = new Date();
    const nowIso = now.toISOString();

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(
        "id,title,internal_status,public_status,shared_slots_sold,shared_price_cents,exclusive_price_cents,exclusive_purchase_id,published_at,expires_at,visible_until,created_at",
      )
      .eq("id", payload.leadId)
      .single();

    if (leadError || !lead || !lead.published_at) {
      return NextResponse.json(
        { error: "Lead non disponibile nel marketplace." },
        { status: 404 },
      );
    }

    const expiresAt = parseLeadDate(lead.expires_at ?? lead.visible_until ?? lead.created_at);
    const canPurchase =
      payload.mode === "exclusive"
        ? isExclusiveAvailable({
            internalStatus: lead.internal_status,
            sharedSlotsSold: lead.shared_slots_sold,
            exclusivePurchaseId: lead.exclusive_purchase_id,
            expiresAt,
            now,
          })
        : isSharedAvailable({
            internalStatus: lead.internal_status,
            sharedSlotsSold: lead.shared_slots_sold,
            exclusivePurchaseId: lead.exclusive_purchase_id,
            expiresAt,
            now,
          });

    if (!canPurchase) {
      return NextResponse.json(
        { error: "Questo lead non e piu acquistabile.", code: "LEAD_NOT_AVAILABLE" },
        { status: 409 },
      );
    }

    const { data: existingPurchase, error: existingPurchaseError } = await supabase
      .from("lead_purchases")
      .select("id,status")
      .eq("lead_id", payload.leadId)
      .eq("property_manager_id", propertyManager.id)
      .maybeSingle();

    if (existingPurchaseError) throw existingPurchaseError;

    if (existingPurchase) {
      return NextResponse.json(
        {
          error: "Hai gia acquistato questo lead. Lo trovi in I miei lead.",
          code: "ALREADY_PURCHASED",
          purchaseId: existingPurchase.id,
        },
        { status: 409 },
      );
    }

    const amountCents =
      payload.mode === "exclusive"
        ? lead.exclusive_price_cents
        : lead.shared_price_cents;
    const wallet = await getOrCreateWallet({
      supabase,
      profileId: profile.id,
    });

    if (wallet.balance_cents < amountCents) {
      return NextResponse.json(
        {
          error: "Credito insufficiente. Ricarica il wallet per acquistare questo lead.",
          code: "INSUFFICIENT_CREDIT",
          balanceCents: wallet.balance_cents,
          requiredAmountCents: amountCents,
          missingAmountCents: amountCents - wallet.balance_cents,
        },
        { status: 402 },
      );
    }

    const { data: purchase, error: purchaseError } = await supabase
      .from("lead_purchases")
      .insert({
        lead_id: payload.leadId,
        property_manager_id: propertyManager.id,
        purchase_attempt_id: null,
        mode: payload.mode,
        amount_cents: amountCents,
        status: "contact_unlocked",
        unlocked_at: nowIso,
      })
      .select("id,lead_id,mode,amount_cents,status,unlocked_at,created_at")
      .single();

    if (purchaseError) {
      return NextResponse.json(
        {
          error: "Non e stato possibile registrare l'acquisto del lead.",
          code: "PURCHASE_NOT_CREATED",
        },
        { status: 409 },
      );
    }

    const leadUpdate = getLeadUpdatePayload({
      mode: payload.mode,
      currentSlotsSold: lead.shared_slots_sold,
      purchaseId: purchase.id,
    });

    let leadUpdateQuery = supabase
      .from("leads")
      .update(leadUpdate)
      .eq("id", lead.id)
      .eq("shared_slots_sold", lead.shared_slots_sold);

    if (!lead.exclusive_purchase_id) {
      leadUpdateQuery = leadUpdateQuery.is("exclusive_purchase_id", null);
    }

    const { data: updatedLead, error: leadUpdateError } = await leadUpdateQuery
      .select("id")
      .maybeSingle();

    if (leadUpdateError || !updatedLead) {
      await supabase
        .from("lead_purchases")
        .update({ status: "cancelled" })
        .eq("id", purchase.id);

      return NextResponse.json(
        {
          error: "Il lead e stato appena acquistato da un altro Property Manager.",
          code: "LEAD_CONFLICT",
        },
        { status: 409 },
      );
    }

    const newBalanceCents = wallet.balance_cents - amountCents;
    const { data: updatedWallet, error: walletUpdateError } = await supabase
      .from("wallets")
      .update({ balance_cents: newBalanceCents })
      .eq("id", wallet.id)
      .eq("balance_cents", wallet.balance_cents)
      .select("id,balance_cents,currency")
      .maybeSingle();

    if (walletUpdateError || !updatedWallet) {
      await rollbackLeadPurchase({
        supabase,
        purchaseId: purchase.id,
        leadId: lead.id,
        previousSlotsSold: lead.shared_slots_sold,
        previousInternalStatus: lead.internal_status,
        previousPublicStatus: lead.public_status,
        previousExclusivePurchaseId: lead.exclusive_purchase_id,
      });

      return NextResponse.json(
        {
          error: "Saldo wallet aggiornato da un'altra operazione. Riprova.",
          code: "WALLET_CONFLICT",
        },
        { status: 409 },
      );
    }

    const { error: transactionError } = await supabase
      .from("wallet_transactions")
      .insert({
        wallet_id: wallet.id,
        profile_id: profile.id,
        type: "lead_purchase",
        status: "completed",
        amount_cents: -amountCents,
        balance_after_cents: newBalanceCents,
        description: `Acquisto lead: ${lead.title}`,
        provider: "wallet",
        provider_reference: purchase.id,
        lead_purchase_id: purchase.id,
        metadata: {
          lead_id: lead.id,
          purchase_mode: payload.mode,
        },
        completed_at: nowIso,
      });

    if (transactionError) throw transactionError;

    return NextResponse.json({
      ok: true,
      leadId: lead.id,
      purchaseId: purchase.id,
      mode: purchase.mode,
      amountCents,
      balanceCents: newBalanceCents,
      sharedSlotsAvailable: getVisibleSharedSlotsAvailable({
        internalStatus: leadUpdate.internal_status,
        sharedSlotsSold: leadUpdate.shared_slots_sold,
        exclusivePurchaseId: leadUpdate.exclusive_purchase_id,
        expiresAt,
      }),
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

function getLeadUpdatePayload({
  mode,
  currentSlotsSold,
  purchaseId,
}: {
  mode: PurchaseMode;
  currentSlotsSold: number;
  purchaseId: string;
}) {
  if (mode === "exclusive") {
    return {
      shared_slots_sold: 0,
      exclusive_purchase_id: purchaseId,
      internal_status: "sold_exclusive" as const,
      public_status: "unavailable" as const,
    };
  }

  const sharedSlotsSold = currentSlotsSold + 1;

  return {
    shared_slots_sold: sharedSlotsSold,
    exclusive_purchase_id: null,
    internal_status:
      sharedSlotsSold >= 2 ? ("sold_two_pm" as const) : ("one_slot_sold" as const),
    public_status:
      sharedSlotsSold >= 2
        ? ("unavailable" as const)
        : ("last_availability" as const),
  };
}

async function getOrCreateWallet({
  supabase,
  profileId,
}: {
  supabase: Awaited<ReturnType<typeof requirePropertyManager>>["supabase"];
  profileId: string;
}) {
  const { data: existingWallet, error: walletError } = await supabase
    .from("wallets")
    .select("id,profile_id,balance_cents,currency")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (walletError) throw walletError;
  if (existingWallet) return existingWallet as WalletRow;

  const { data: wallet, error: createWalletError } = await supabase
    .from("wallets")
    .insert({ profile_id: profileId })
    .select("id,profile_id,balance_cents,currency")
    .single();

  if (createWalletError || !wallet) throw createWalletError;

  return wallet as WalletRow;
}

async function rollbackLeadPurchase({
  supabase,
  purchaseId,
  leadId,
  previousSlotsSold,
  previousInternalStatus,
  previousPublicStatus,
  previousExclusivePurchaseId,
}: {
  supabase: Awaited<ReturnType<typeof requirePropertyManager>>["supabase"];
  purchaseId: string;
  leadId: string;
  previousSlotsSold: number;
  previousInternalStatus: "available" | "one_slot_sold" | "sold_two_pm" | "sold_exclusive" | "withdrawn_after_7_days" | "cancelled" | "refunded";
  previousPublicStatus: "available" | "last_availability" | "unavailable";
  previousExclusivePurchaseId: string | null;
}) {
  await Promise.all([
    supabase
      .from("lead_purchases")
      .update({ status: "cancelled" })
      .eq("id", purchaseId),
    supabase
      .from("leads")
      .update({
        shared_slots_sold: previousSlotsSold,
        internal_status: previousInternalStatus,
        public_status: previousPublicStatus,
        exclusive_purchase_id: previousExclusivePurchaseId,
      })
      .eq("id", leadId),
  ]);
}
