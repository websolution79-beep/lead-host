import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  getAccessTokenMaxAge,
  getClearSessionCookieOptions,
  getSessionCookieOptions,
} from "@/lib/auth/session-cookies";
import type { AppRole } from "@/lib/auth/roles";
import { verifyAccessToken } from "@/lib/auth/verify-access-token";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type SessionPayload = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number | null;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as SessionPayload;

  if (!payload.accessToken) {
    return NextResponse.json({ error: "Sessione non valida." }, { status: 400 });
  }

  const identity = await verifyAccessToken(payload.accessToken);

  if (!identity) {
    return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { data: profile, error: profileError } = await serviceSupabase
    .from("profiles")
    .select("id,status")
    .eq("auth_user_id", identity.id)
    .single();

  if (profileError || !profile || profile.status !== "active") {
    return NextResponse.json({ error: "Profilo non attivo." }, { status: 403 });
  }

  const { data: roleRows, error: rolesError } = await serviceSupabase
    .from("user_roles")
    .select("role")
    .eq("profile_id", profile.id);

  if (rolesError) {
    return NextResponse.json({ error: "Ruoli non disponibili." }, { status: 500 });
  }

  const roles = ((roleRows ?? []) as { role: AppRole }[]).map((item) => item.role);
  const response = NextResponse.json({ ok: true, roles });
  response.cookies.set(
    ACCESS_TOKEN_COOKIE,
    payload.accessToken,
    getSessionCookieOptions(getAccessTokenMaxAge(payload.expiresAt)),
  );

  if (payload.refreshToken) {
    response.cookies.set(REFRESH_TOKEN_COOKIE, payload.refreshToken, getSessionCookieOptions());
  }

  return response;
}

export function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", getClearSessionCookieOptions());
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", getClearSessionCookieOptions());

  return response;
}
