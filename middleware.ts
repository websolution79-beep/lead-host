import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  getAccessTokenMaxAge,
  getClearSessionCookieOptions,
  getSessionCookieOptions,
} from "@/lib/auth/session-cookies";
import type { Database } from "@/lib/supabase/database.types";

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return redirectToLogin(request);
  }

  // Layout e API eseguono comunque la validazione completa. Qui basta evitare
  // una chiamata remota finché il token non è vicino alla scadenza.
  if (accessToken && isAccessTokenFresh(accessToken)) {
    return NextResponse.next();
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  if (refreshToken) {
    const { data } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    const session = data.session;

    if (session) {
      const response = NextResponse.next();
      response.cookies.set(
        ACCESS_TOKEN_COOKIE,
        session.access_token,
        getSessionCookieOptions(getAccessTokenMaxAge(session.expires_at)),
      );
      response.cookies.set(
        REFRESH_TOKEN_COOKIE,
        session.refresh_token,
        getSessionCookieOptions(),
      );

      return response;
    }
  }

  const response = redirectToLogin(request);
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", getClearSessionCookieOptions());
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", getClearSessionCookieOptions());

  return response;
}

function isAccessTokenFresh(token: string) {
  try {
    const payloadPart = token.split(".")[1];

    if (!payloadPart) return false;

    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { exp?: number };

    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now() + 30_000;
  } catch {
    return false;
  }
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/app", "/app/:path*", "/admin", "/admin/:path*"],
};
