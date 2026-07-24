import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";

const createRefundSchema = z.object({
  leadPurchaseId: z.string().uuid(),
  reason: z.string().trim().min(3).max(600),
});

const updateRefundSchema = z.object({
  refundId: z.string().uuid(),
  action: z.enum(["approve", "reject", "pay"]),
  reason: z.string().trim().max(600).optional(),
});

type RefundRow = {
  id: string;
  lead_purchase_id: string;
  requested_by_property_manager_id: string;
  amount_cents: number | null;
  status: "pending" | "approved" | "rejected" | "paid";
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type PurchaseRow = {
  id: string;
  lead_id: string;
  property_manager_id: string;
  mode: "shared" | "exclusive";
  amount_cents: number;
  status: string;
  created_at: string;
};

type RefundRpcResult = {
  refund_id: string;
  wallet_transaction_id: string | null;
  balance_cents: number;
  amount_cents: number;
  status: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const refundsTable = getRefundsTable(supabase);
    const { data: refunds, error: refundsError } = await refundsTable
      .select(
        "id,lead_purchase_id,requested_by_property_manager_id,amount_cents,status,reason,reviewed_by,reviewed_at,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(150);

    if (refundsError) throw refundsError;

    const refundRows = refunds ?? [];
    const refundPurchaseIds = Array.from(
      new Set(refundRows.map((item) => item.lead_purchase_id)),
    );
    const { data: refundablePurchases, error: refundableError } = await supabase
      .from("lead_purchases")
      .select("id,lead_id,property_manager_id,mode,amount_cents,status,created_at")
      .in("status", ["paid", "contact_unlocked"])
      .order("created_at", { ascending: false })
      .limit(100);

    if (refundableError) throw refundableError;

    const purchaseIds = Array.from(
      new Set([
        ...refundPurchaseIds,
        ...((refundablePurchases ?? []) as PurchaseRow[]).map((item) => item.id),
      ]),
    );
    const purchases = purchaseIds.length
      ? await fetchPurchases(supabase, purchaseIds)
      : new Map<string, PurchaseRow>();
    const managerIds = Array.from(
      new Set([
        ...refundRows.map((item) => item.requested_by_property_manager_id),
        ...Array.from(purchases.values()).map((item) => item.property_manager_id),
      ]),
    );
    const leadIds = Array.from(new Set(Array.from(purchases.values()).map((item) => item.lead_id)));
    const [{ managerById, profileByManagerId }, leadTitleById] = await Promise.all([
      fetchManagers(supabase, managerIds),
      fetchLeadTitles(supabase, leadIds),
    ]);
    const openRefundPurchaseIds = new Set(
      refundRows
        .filter((item) => ["pending", "approved", "paid"].includes(item.status))
        .map((item) => item.lead_purchase_id),
    );

    return NextResponse.json({
      stats: {
        pending: refundRows.filter((item) => item.status === "pending").length,
        approved: refundRows.filter((item) => item.status === "approved").length,
        rejected: refundRows.filter((item) => item.status === "rejected").length,
        paid: refundRows.filter((item) => item.status === "paid").length,
        paidCents: sumCents(
          refundRows
            .filter((item) => item.status === "paid")
            .map((item) => item.amount_cents ?? 0),
        ),
      },
      refunds: refundRows.map((refund) => {
        const purchase = purchases.get(refund.lead_purchase_id);

        return mapRefund({
          refund,
          purchase,
          leadTitle: purchase ? leadTitleById.get(purchase.lead_id) : null,
          manager: managerById.get(refund.requested_by_property_manager_id),
          profile: profileByManagerId.get(refund.requested_by_property_manager_id),
        });
      }),
      refundablePurchases: ((refundablePurchases ?? []) as PurchaseRow[])
        .filter((purchase) => !openRefundPurchaseIds.has(purchase.id))
        .map((purchase) => ({
          id: purchase.id,
          leadTitle: leadTitleById.get(purchase.lead_id) ?? "Lead acquistato",
          propertyManagerName: formatManagerName(
            managerById.get(purchase.property_manager_id),
            profileByManagerId.get(purchase.property_manager_id),
          ),
          propertyManagerEmail:
            profileByManagerId.get(purchase.property_manager_id)?.email ?? null,
          mode: purchase.mode,
          amountCents: purchase.amount_cents,
          status: purchase.status,
          createdAt: purchase.created_at,
        })),
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = createRefundSchema.parse(await request.json());
    const { data: purchase, error: purchaseError } = await supabase
      .from("lead_purchases")
      .select("id,property_manager_id,amount_cents,status")
      .eq("id", payload.leadPurchaseId)
      .single();

    if (purchaseError || !purchase) {
      return NextResponse.json({ error: "Acquisto lead non trovato." }, { status: 404 });
    }

    if (!["paid", "contact_unlocked"].includes(purchase.status)) {
      return NextResponse.json(
        { error: "Questo acquisto non è idoneo al riaccredito." },
        { status: 422 },
      );
    }

    const refundsTable = getRefundsTable(supabase);
    const { error } = await refundsTable.insert({
      lead_purchase_id: purchase.id,
      requested_by_property_manager_id: purchase.property_manager_id,
      amount_cents: purchase.amount_cents,
      status: "pending",
      reason: payload.reason,
      reviewed_by: profile.id,
    });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = updateRefundSchema.parse(await request.json());
    const refundsTable = getRefundsTable(supabase);

    if (payload.action === "pay") {
      const rpcClient = supabase as unknown as {
        rpc: (
          fn: "pay_wallet_refund",
          args: {
            p_refund_id: string;
            p_reviewer_profile_id: string;
          },
        ) => {
          single: () => Promise<{
            data: RefundRpcResult | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
      const { data, error } = await rpcClient
        .rpc("pay_wallet_refund", {
          p_refund_id: payload.refundId,
          p_reviewer_profile_id: profile.id,
        })
        .single();

      if (error || !data) {
        const message = error?.message ?? "Riaccredito Wallet non completato.";

        if (error?.code === "PGRST202" || message.includes("pay_wallet_refund")) {
          return NextResponse.json(
            {
              error:
                "Database non aggiornato per i riaccrediti Wallet. Applica la migration commercial_safety_hardening e riprova.",
            },
            { status: 409 },
          );
        }

        return NextResponse.json({ error: message }, { status: 422 });
      }

      return NextResponse.json({ ok: true, result: data });
    }

    const update =
      payload.action === "approve"
        ? {
            status: "approved",
            reason: payload.reason,
            reviewed_by: profile.id,
            reviewed_at: new Date().toISOString(),
          }
        : {
            status: "rejected",
            reason: payload.reason,
            reviewed_by: profile.id,
            reviewed_at: new Date().toISOString(),
          };
    const { error } = await refundsTable
      .update(removeUndefined(update))
      .eq("id", payload.refundId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function getRefundsTable(supabase: unknown) {
  return (supabase as { from: (table: string) => unknown }).from("refunds") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => {
        limit: (count: number) => Promise<{
          data: RefundRow[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
    update: (row: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
    };
  };
}

async function fetchPurchases(
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"],
  purchaseIds: string[],
) {
  const { data, error } = await supabase
    .from("lead_purchases")
    .select("id,lead_id,property_manager_id,mode,amount_cents,status,created_at")
    .in("id", purchaseIds);

  if (error) throw error;

  return new Map(((data ?? []) as PurchaseRow[]).map((purchase) => [purchase.id, purchase]));
}

async function fetchManagers(
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"],
  managerIds: string[],
) {
  if (!managerIds.length) {
    return { managerById: new Map(), profileByManagerId: new Map() };
  }

  const { data: managers, error: managersError } = await supabase
    .from("property_manager_profiles")
    .select("id,profile_id,company_name")
    .in("id", managerIds);

  if (managersError) throw managersError;

  const profileIds = Array.from(new Set((managers ?? []).map((manager) => manager.profile_id)));
  const { data: profiles, error: profilesError } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id,email,first_name,last_name")
        .in("id", profileIds)
    : { data: [], error: null };

  if (profilesError) throw profilesError;

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const managerById = new Map((managers ?? []).map((manager) => [manager.id, manager]));
  const profileByManagerId = new Map(
    (managers ?? []).map((manager) => [manager.id, profileById.get(manager.profile_id)]),
  );

  return { managerById, profileByManagerId };
}

async function fetchLeadTitles(
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"],
  leadIds: string[],
) {
  if (!leadIds.length) return new Map<string, string>();

  const { data, error } = await supabase.from("leads").select("id,title").in("id", leadIds);

  if (error) throw error;

  return new Map((data ?? []).map((lead) => [lead.id, lead.title]));
}

function mapRefund({
  refund,
  purchase,
  leadTitle,
  manager,
  profile,
}: {
  refund: RefundRow;
  purchase?: PurchaseRow;
  leadTitle?: string | null;
  manager?: { company_name: string | null } | null;
  profile?: {
    email: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}) {
  return {
    id: refund.id,
    leadPurchaseId: refund.lead_purchase_id,
    leadTitle: leadTitle ?? "Lead acquistato",
    propertyManagerName: formatManagerName(manager, profile),
    propertyManagerEmail: profile?.email ?? null,
    purchaseMode: purchase?.mode ?? null,
    purchaseAmountCents: purchase?.amount_cents ?? null,
    amountCents: refund.amount_cents,
    status: refund.status,
    reason: refund.reason,
    reviewedAt: refund.reviewed_at,
    createdAt: refund.created_at,
  };
}

function formatManagerName(
  manager?: { company_name: string | null } | null,
  profile?: {
    email: string;
    first_name: string | null;
    last_name: string | null;
  } | null,
) {
  return (
    manager?.company_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    profile?.email ||
    "Property Manager"
  );
}

function removeUndefined(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

function sumCents(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
