import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedProfileContext } from "@/lib/auth/profile-context";
import { getTeamAccessForProfile } from "@/lib/admin/team-access";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, getAccessTokenMaxAge, getSessionCookieOptions } from "@/lib/auth/session-cookies";

const headers = { "Cache-Control": "no-store", Pragma: "no-cache", Vary: "Cookie, Origin" };

export async function POST(request: NextRequest) {
  // This endpoint returns credentials: never allow cross-origin recovery.
  if (request.headers.get("origin") !== new URL(request.url).origin ||
      (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) {
    return NextResponse.json({ error: "Origine non autorizzata." }, { status: 403, headers });
  }
  const payload = await request.json().catch(() => null) as { userId?: unknown } | null;
  if (typeof payload?.userId !== "string" || !payload.userId) return NextResponse.json({ error: "Sessione non valida." }, { status: 400, headers });
  let accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  let rotated: { access_token: string; refresh_token: string; expires_at?: number } | null = null;
  try {
    let expiresAt = tokenExpiry(accessToken);
    if (!accessToken || expiresAt * 1000 <= Date.now() + 30_000) {
      if (!refreshToken) return unauthorized();
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) {
        return error && (error.status === undefined || error.status >= 500)
          ? NextResponse.json({ error: "Servizio di accesso momentaneamente non disponibile. Riprova tra poco." }, { status: 503, headers })
          : unauthorized();
      }
      rotated = data.session;
      accessToken = data.session.access_token;
      expiresAt = tokenExpiry(accessToken);
    }
    const context = await getAuthenticatedProfileContext(accessToken);
    if (!context || context.userId !== payload.userId) return unauthorized();
    if (context.profile.status !== "active") return NextResponse.json({ error: "Profilo non attivo." }, { status: 403, headers });
    if (context.roles.includes("team_member") && !context.roles.includes("super_admin")) {
      const team = await getTeamAccessForProfile(context.profile.id);
      if (team?.status !== "active" || team.mustChangePassword) {
        return NextResponse.json({ error: "Accesso Team non disponibile. Verifica lo stato del tuo account." }, { status: 403, headers });
      }
    }
    const response = NextResponse.json({ accessToken, expiresAt, userId: context.userId }, { headers });
    if (rotated) {
      response.cookies.set(ACCESS_TOKEN_COOKIE, rotated.access_token, getSessionCookieOptions(getAccessTokenMaxAge(rotated.expires_at)));
      response.cookies.set(REFRESH_TOKEN_COOKIE, rotated.refresh_token, getSessionCookieOptions());
    }
    return response;
  } catch {
    return NextResponse.json({ error: "Non riesco a verificare la sessione. Riprova tra poco." }, { status: 503, headers });
  }
}

function unauthorized() {
  return NextResponse.json({ error: "Sessione scaduta. Accedi nuovamente in un'altra scheda e riprova: i dati inseriti restano nel modulo." }, { status: 401, headers });
}

function tokenExpiry(token?: string) {
  try {
    const payload = JSON.parse(Buffer.from(token?.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : 0;
  } catch { return 0; }
}
