import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export function generateSystemeSigningSecret() {
  return `lh_systeme_${randomBytes(32).toString("base64url")}`;
}

function encryptionKey(value: string) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error("Invalid Marketing integration encryption key.");
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("Invalid Marketing integration encryption key.");
  return key;
}

export function encryptSystemeSecret(secret: string, integrationId: string, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(integrationId));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), ciphertext.toString("base64"), cipher.getAuthTag().toString("base64")].join(":");
}

export function decryptSystemeSecret(encrypted: string, integrationId: string, key: string) {
  const [version, ivValue, ciphertextValue, tagValue, extra] = encrypted.split(":");
  if (version !== "v1" || !ivValue || !ciphertextValue || !tagValue || extra !== undefined) {
    throw new Error("Invalid encrypted Systeme.io signing secret.");
  }
  const iv = Buffer.from(ivValue, "base64");
  const tag = Buffer.from(tagValue, "base64");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted Systeme.io signing secret.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(key), iv);
  decipher.setAAD(Buffer.from(integrationId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64")), decipher.final()]).toString("utf8");
}

// Systeme.io documents JSON normalization with escaped slashes and Unicode.
export function normalizeSystemeJson(rawBody: string) {
  return JSON.stringify(JSON.parse(rawBody))
    .replace(/\//g, "\\/")
    .replace(/[\u0080-\uffff]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function verifySystemeSignature(rawBody: string, signature: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const provided = Buffer.from(signature, "hex");
  const matches = (body: string) => timingSafeEqual(
    provided,
    createHmac("sha256", secret).update(body, "utf8").digest(),
  );
  if (matches(rawBody)) return true;
  try {
    return matches(normalizeSystemeJson(rawBody));
  } catch {
    return false;
  }
}

export function systemePayloadHash(rawBody: string) {
  let body = rawBody;
  try { body = normalizeSystemeJson(rawBody); } catch { /* Invalid signed JSON is logged without the payload. */ }
  return createHash("sha256").update(body, "utf8").digest("hex");
}
