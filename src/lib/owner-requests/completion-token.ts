import { createHash, randomBytes } from "crypto";

export const OWNER_REQUEST_COMPLETION_TOKEN_DAYS = 14;

export function createOwnerRequestCompletionToken() {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    tokenHash: hashOwnerRequestCompletionToken(token),
    expiresAt: getOwnerRequestCompletionExpiry().toISOString(),
  };
}

export function hashOwnerRequestCompletionToken(token: string) {
  return createHash("sha256")
    .update(`lead-host:owner-request-completion:${token}`)
    .digest("hex");
}

export function getOwnerRequestCompletionExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + OWNER_REQUEST_COMPLETION_TOKEN_DAYS);

  return expiresAt;
}

export function isOwnerRequestCompletionExpired(expiresAt: string | null) {
  if (!expiresAt) return true;

  return new Date(expiresAt).getTime() <= Date.now();
}
