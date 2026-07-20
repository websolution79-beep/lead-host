import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.META_VERIFY_TOKEN &&
    challenge
  ) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Invalid Meta verification" }, { status: 403 });
}

export async function POST() {
  return NextResponse.json(
    {
      status: "not_implemented",
      next: "Phase 4 will verify X-Hub-Signature-256, persist raw events, fetch leadgen payloads, and normalize fields.",
    },
    { status: 501 },
  );
}
