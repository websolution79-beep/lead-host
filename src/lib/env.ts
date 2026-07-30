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

/**
 * Returns the canonical public URL when configured, otherwise the origin of
 * the current request. The request fallback keeps auth links valid on Vercel
 * previews and prevents a missing local env value from leaking into emails.
 */
export function getRequestAppUrl(request: Request) {
  const configured = getEnv("NEXT_PUBLIC_APP_URL")?.trim().replace(/\/+$/, "");

  if (configured && !isLocalAppUrl(configured)) {
    return configured;
  }

  return new URL(request.url).origin;
}

export const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
