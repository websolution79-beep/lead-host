import { createReadStream, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  createR2Client,
  getBackupPrefix,
  getR2Bucket,
  putJson,
  requireEnv,
} from "./common.mjs";

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

const encryptedPath = requireEnv("BACKUP_ENCRYPTED_FILE");
const plainPath = requireEnv("BACKUP_PLAIN_FILE");
const timestamp = requireEnv("BACKUP_TIMESTAMP");
const prefix = getBackupPrefix();
const client = createR2Client();
const stat = await fs.stat(encryptedPath);
const objectKey = `${prefix}/database/daily/${timestamp}.dump.enc`;

await client.send(new PutObjectCommand({
  Bucket: getR2Bucket(),
  Key: objectKey,
  Body: createReadStream(encryptedPath),
  ContentLength: stat.size,
  ContentType: "application/octet-stream",
  Metadata: { format: "pg-dump-custom-aes-256-gcm" },
}));

const manifest = {
  version: 1,
  kind: "postgresql-logical-backup",
  createdAt: new Date().toISOString(),
  timestamp,
  objectKey,
  encryptedBytes: stat.size,
  encryptedSha256: await hashFile(encryptedPath),
  plainSha256: await hashFile(plainPath),
  format: "pg_dump custom",
  encryption: "AES-256-GCM",
  source: "Lead Host production",
  gitSha: process.env.GITHUB_SHA || null,
};

await putJson(client, `${prefix}/manifests/database/${timestamp}.json`, manifest);
await putJson(client, `${prefix}/manifests/database/latest.json`, manifest);
console.log(JSON.stringify({ uploaded: objectKey, bytes: stat.size, manifest }, null, 2));

