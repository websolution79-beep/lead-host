import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      status: "not_implemented",
      next: "Gli acquisti lead usano il credito wallet. Stripe sara collegato solo alla ricarica wallet nella fase pagamenti.",
    },
    { status: 501 },
  );
}
