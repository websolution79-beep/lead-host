import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AdminApiError,
  adminApiErrorResponse,
  requireSuperAdmin,
} from "@/lib/admin/auth";

const walletBonusSchema = z.object({
  profileId: z.string().uuid(),
  amountCents: z.number().int().min(100).max(100000),
  reason: z.string().trim().min(3).max(160),
  internalNote: z.string().trim().max(500).optional().default(""),
  operationId: z.string().uuid(),
});

type WalletBonusResult = {
  wallet_transaction_id: string;
  target_profile_id: string;
  amount_cents: number;
  balance_cents: number;
};

export async function POST(request: NextRequest) {
  try {
    const context = await requireSuperAdmin(request);
    if (!context.isSuperAdmin) {
      throw new AdminApiError(403, "Ruolo Super Admin richiesto.");
    }

    const payload = walletBonusSchema.parse(await request.json());
    const rpcClient = context.supabase as unknown as {
      rpc: (
        fn: "grant_manual_wallet_bonus",
        args: {
          p_target_profile_id: string;
          p_actor_profile_id: string;
          p_amount_cents: number;
          p_reason: string;
          p_internal_note: string;
          p_operation_id: string;
        },
      ) => Promise<{
        data: WalletBonusResult[] | null;
        error: { message?: string; code?: string } | null;
      }>;
    };

    const { data, error } = await rpcClient.rpc("grant_manual_wallet_bonus", {
      p_target_profile_id: payload.profileId,
      p_actor_profile_id: context.profile.id,
      p_amount_cents: payload.amountCents,
      p_reason: payload.reason,
      p_internal_note: payload.internalNote,
      p_operation_id: payload.operationId,
    });

    if (error) {
      throw mapWalletBonusError(error.message ?? "");
    }

    const result = data?.[0];
    if (!result) {
      throw new AdminApiError(500, "Accredito bonus non completato.");
    }

    return NextResponse.json(
      {
        walletTransactionId: result.wallet_transaction_id,
        profileId: result.target_profile_id,
        amountCents: result.amount_cents,
        balanceCents: result.balance_cents,
      },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Controlla importo e motivazione del bonus." },
        { status: 422 },
      );
    }
    return adminApiErrorResponse(error);
  }
}

function mapWalletBonusError(message: string) {
  if (message.includes("wallet_bonus_super_admin_required")) {
    return new AdminApiError(403, "Ruolo Super Admin richiesto.");
  }
  if (message.includes("wallet_bonus_property_manager_not_found")) {
    return new AdminApiError(404, "Property Manager non trovato.");
  }
  if (message.includes("wallet_bonus_invalid_amount")) {
    return new AdminApiError(422, "Inserisci un bonus compreso tra 1 € e 1.000 €.");
  }
  if (
    message.includes("wallet_bonus_invalid_reason") ||
    message.includes("wallet_bonus_invalid_note")
  ) {
    return new AdminApiError(422, "Controlla motivazione e nota interna.");
  }
  if (message.includes("wallet_bonus_operation_conflict")) {
    return new AdminApiError(409, "Questa operazione bonus è già stata utilizzata.");
  }
  if (message.includes("wallet_bonus_balance_overflow")) {
    return new AdminApiError(409, "Il saldo risultante supera il limite consentito.");
  }
  if (
    message.includes("grant_manual_wallet_bonus") ||
    message.includes("PGRST202")
  ) {
    return new AdminApiError(
      503,
      "Database non aggiornato per i bonus Wallet. Applica la migration e riprova.",
    );
  }
  return new AdminApiError(500, "Non sono riuscito ad accreditare il bonus Wallet.");
}
