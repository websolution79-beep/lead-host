import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

export const ACCESS_TOKEN_COOKIE = "lead_host_access_token";
export const REFRESH_TOKEN_COOKIE = "lead_host_refresh_token";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export function getSessionCookieOptions(maxAge = THIRTY_DAYS_SECONDS): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function getClearSessionCookieOptions(): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export function getAccessTokenMaxAge(expiresAt?: number | null) {
  if (!expiresAt) {
    return 60 * 60;
  }

  return Math.max(60, expiresAt - Math.floor(Date.now() / 1000));
}
