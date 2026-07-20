import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      status: "not_implemented",
      next: "Phase 7 will create Stripe Checkout sessions for shared and exclusive lead purchases.",
    },
    { status: 501 },
  );
}
