import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  getAccessTokenMaxAge,
  getClearSessionCookieOptions,
  getSessionCookieOptions,
} from "@/lib/auth/session-cookies";
import { getAuthenticatedProfileContext } from "@/lib/auth/profile-context";

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

  const context = await getAuthenticatedProfileContext(payload.accessToken);

  if (!context) {
    return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
  }

  if (context.profile.status !== "active") {
    return NextResponse.json({ error: "Profilo non attivo." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, roles: context.roles });
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
