export function getEnv(name: string) {
  return process.env[name] || undefined;
}

export function requireEnv(name: string) {
  const value = getEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function isLocalAppUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return true;
  }
}

const productionAppUrl = "https://www.leadhost.it";

function getPublicOrigin(value: string | null | undefined) {
  if (!value) return null;

  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized || isLocalAppUrl(normalized)) return null;

  try {
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

/**
 * Returns the canonical public URL when configured, otherwise the origin of
 * the current request. The request fallback keeps auth links valid on Vercel
 * previews and prevents a missing local env value from leaking into emails.
 */
export function getRequestAppUrl(request: Request) {
  const configured = getPublicOrigin(getEnv("NEXT_PUBLIC_APP_URL"));

  if (configured) {
    return configured;
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const forwardedOrigin = getPublicOrigin(
    forwardedHost ? `${forwardedProto || "https"}://${forwardedHost}` : null,
  );

  if (forwardedOrigin) {
    return forwardedOrigin;
  }

  const requestOrigin = getPublicOrigin(new URL(request.url).origin);
  return requestOrigin ?? productionAppUrl;
}

export const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? productionAppUrl;
