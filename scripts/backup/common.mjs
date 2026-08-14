import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const ENCRYPTION_MAGIC = Buffer.from("LHBK0001", "ascii");
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variabile obbligatoria mancante: ${name}`);
  }
  return value;
}

export function optionalEnv(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

export function getBackupPrefix() {
  return optionalEnv("BACKUP_PREFIX", "lead-host").replace(/^\/+|\/+$/g, "");
}

export function getEncryptionKey() {
  const encoded = requireEnv("BACKUP_ENCRYPTION_KEY");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY deve essere una chiave base64 da 32 byte.");
  }
  return key;
}

export function encryptBuffer(plainBuffer) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ENCRYPTION_MAGIC, iv, encrypted, tag]);
}

export function decryptBuffer(encryptedBuffer) {
  const minimumLength = ENCRYPTION_MAGIC.length + IV_LENGTH + AUTH_TAG_LENGTH;
  if (encryptedBuffer.length < minimumLength) {
    throw new Error("Backup cifrato non valido o incompleto.");
  }
  const magic = encryptedBuffer.subarray(0, ENCRYPTION_MAGIC.length);
  if (!magic.equals(ENCRYPTION_MAGIC)) {
    throw new Error("Formato backup non riconosciuto.");
  }
  const ivStart = ENCRYPTION_MAGIC.length;
  const dataStart = ivStart + IV_LENGTH;
  const tagStart = encryptedBuffer.length - AUTH_TAG_LENGTH;
  const iv = encryptedBuffer.subarray(ivStart, dataStart);
  const encrypted = encryptedBuffer.subarray(dataStart, tagStart);
  const tag = encryptedBuffer.subarray(tagStart);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function createR2Client() {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export function getR2Bucket() {
  return requireEnv("R2_BUCKET");
}

export async function objectExists(client, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: getR2Bucket(), Key: key }));
    return true;
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === "NotFound" || error?.name === "NoSuchKey") {
      return false;
    }
    throw error;
  }
}

export async function putBuffer(client, key, buffer, contentType = "application/octet-stream") {
  await client.send(new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
    Body: buffer,
    ContentLength: buffer.length,
    ContentType: contentType,
  }));
}

export async function putJson(client, key, value) {
  const buffer = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await putBuffer(client, key, buffer, "application/json");
}

export async function getBuffer(client, key) {
  const response = await client.send(new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
  }));
  if (!response.Body) {
    throw new Error(`Oggetto R2 senza contenuto: ${key}`);
  }
  return Buffer.from(await response.Body.transformToByteArray());
}

export async function getJsonIfExists(client, key) {
  if (!(await objectExists(client, key))) return null;
  const buffer = await getBuffer(client, key);
  return JSON.parse(buffer.toString("utf8"));
}

export function bufferToReadable(buffer) {
  return Readable.from(buffer);
}

