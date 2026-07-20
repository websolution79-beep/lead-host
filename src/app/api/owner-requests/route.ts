import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      status: "not_implemented",
      next: "Phase 2 will persist owner requests through the normalized acquisition pipeline.",
    },
    { status: 501 },
  );
}
