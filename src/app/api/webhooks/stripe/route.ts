import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      status: "not_implemented",
      next: "Phase 7 will verify Stripe signatures and call claim_paid_lead_purchase after payment confirmation.",
    },
    { status: 501 },
  );
}
