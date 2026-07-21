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

  if (accessToken) {
    const {
      data: { user },
    } = await supabase.auth.getUser(accessToken);

    if (user) {
      return NextResponse.next();
    }
  }

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

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/app", "/app/:path*"],
};
