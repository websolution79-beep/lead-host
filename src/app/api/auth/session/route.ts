import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  getAccessTokenMaxAge,
  getClearSessionCookieOptions,
  getSessionCookieOptions,
} from "@/lib/auth/session-cookies";
import { requireEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

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

  const supabase = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(payload.accessToken);

  if (error || !user) {
    return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
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
