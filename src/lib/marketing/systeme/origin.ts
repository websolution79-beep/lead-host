export function systemeWebhookOrigin(canonicalOrigin: string, environment: Record<string, string | undefined>) {
  if (environment.VERCEL_ENV !== "preview") return canonicalOrigin;
  const host = environment.VERCEL_BRANCH_URL || environment.VERCEL_URL;
  if (!host || !/^[a-z0-9-]+\.vercel\.app$/i.test(host)) {
    throw new Error("Systeme.io preview webhook origin is unavailable.");
  }
  return `https://${host}`;
}
