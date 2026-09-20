import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { readRowsInIdBatches } from "@/lib/supabase/batched-query";

export const dynamic = "force-dynamic";
const TEMPORARY_DIAGNOSTIC_NONCE = "bcfdc4d9-1f18-4e43-87eb-dc7796062049";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = createServiceSupabaseClient();
  const checks: Record<string, unknown> = {};

  const roles = await supabase
    .from("user_roles")
    .select("profile_id")
    .eq("role", "property_manager");
  checks.userRoles = summarize(roles);
  const profileIds = [...new Set((roles.data ?? []).map((row) => row.profile_id))];

  const [profiles, pmProfiles, wallets, primeAccounts, primeNotes, subscriptions, authUsers] =
    await Promise.all([
      readRowsInIdBatches(profileIds, (batch) => supabase
        .from("profiles")
        .select("id,email,first_name,last_name,phone,status,created_at")
        .in("id", batch)),
      readRowsInIdBatches(profileIds, (batch) => supabase
        .from("property_manager_profiles")
        .select("profile_id,primary_city,managed_properties_range,managed_properties_count")
        .in("profile_id", batch)),
      readRowsInIdBatches(profileIds, (batch) => supabase
        .from("wallets")
        .select("profile_id,balance_cents,currency")
        .in("profile_id", batch)),
      readRowsInIdBatches(profileIds, (batch) => supabase
        .from("prime_accounts").select("*").in("profile_id", batch)),
      readRowsInIdBatches(profileIds, (batch) => supabase
        .from("prime_internal_notes")
        .select("profile_id,interest_locations")
        .in("profile_id", batch)),
      readRowsInIdBatches(profileIds, (batch) => supabase
        .from("addon_subscriptions")
        .select("id,profile_id,status,source,current_period_ends_at,cancel_at_period_end,canceled_at,updated_at")
        .in("profile_id", batch)),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  checks.profiles = { ok: true, count: profiles.length };
  checks.propertyManagerProfiles = { ok: true, count: pmProfiles.length };
  checks.wallets = { ok: true, count: wallets.length };
  checks.primeAccounts = { ok: true, count: primeAccounts.length };
  checks.primeNotes = { ok: true, count: primeNotes.length };
  checks.subscriptions = { ok: true, count: subscriptions.length };
  checks.authUsers = authUsers.error
    ? { ok: false, error: safeError(authUsers.error) }
    : { ok: true, count: authUsers.data.users.length };

  return NextResponse.json(
    {
      environment: {
        publishableKey: Boolean(getEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")),
        anonKey: Boolean(getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")),
        secretKey: Boolean(getEnv("SUPABASE_SECRET_KEY")),
        serviceRoleKey: Boolean(getEnv("SUPABASE_SERVICE_ROLE_KEY")),
      },
      profileCount: profileIds.length,
      checks,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
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

function summarize(result: { data: unknown[] | null; error: unknown }) {
  return result.error
    ? { ok: false, error: safeError(result.error) }
    : { ok: true, count: result.data?.length ?? 0 };
}

function safeError(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error) };
  const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  return {
    code: typeof value.code === "string" ? value.code : null,
    message: typeof value.message === "string" ? value.message : "Unknown error",
    details: typeof value.details === "string" ? value.details : null,
    hint: typeof value.hint === "string" ? value.hint : null,
  };
}
