import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import {
  previewWalletTopUpCoupon,
  WalletCouponError,
} from "@/lib/wallet/coupons";

const previewSchema = z.object({
  code: z.string().trim().min(3).max(40),
  amountCents: z.number().int().positive().max(200000),
});

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const payload = previewSchema.parse(await request.json());
    const coupon = await previewWalletTopUpCoupon({
      supabase,
      profileId: profile.id,
      code: payload.code,
      paidAmountCents: payload.amountCents,
    });

    return NextResponse.json({ ok: true, coupon });
  } catch (error) {
    if (error instanceof WalletCouponError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    return propertyManagerApiErrorResponse(error);
  }
}
