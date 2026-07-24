import { createHash } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export async function consumeOwnerRequestRateLimit(
  request: Request,
): Promise<RateLimitResult> {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const userAgent = request.headers.get("user-agent")?.trim();
  const fingerprint = createHash("sha256")
    .update(`owner-request:${forwardedFor || realIp || "unknown"}:${userAgent || "unknown"}`)
    .digest("hex");
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("consume_public_form_rate_limit", {
    p_fingerprint_hash: fingerprint,
    p_limit: 8,
    p_window_seconds: 900,
  });

  if (error) {
    throw new Error(
      `Owner request rate limit unavailable: ${error.message ?? "unknown error"}`,
    );
  }

  const result = data?.[0];

  return {
    allowed: result?.allowed === true,
    retryAfterSeconds: Math.max(0, result?.retry_after_seconds ?? 0),
  };
}
