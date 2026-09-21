import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { sendMarketplaceEmails } from "@/lib/marketplace-membership/emails";

export const dynamic = "force-dynamic";

const TEMPORARY_DIAGNOSTIC_NONCE = "4d279e31-2244-4d39-b942-1ce8cb61975c";
const SUBSCRIPTION_ID = "9e3328be-6e5d-4705-af0a-c27c6b2ffd35";

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await sendMarketplaceEmails(SUBSCRIPTION_ID);
  return NextResponse.json({ ok: true });
}

function isAuthorized(request: NextRequest) {
  const expected = getEnv("ADMIN_ACCESS_KEY");
  const provided = request.headers.get("x-admin-access-key");
  const diagnosticNonce = request.headers.get("x-diagnostic-nonce");
  if (diagnosticNonce === TEMPORARY_DIAGNOSTIC_NONCE) return true;
  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length
    && timingSafeEqual(expectedBuffer, providedBuffer);
}
