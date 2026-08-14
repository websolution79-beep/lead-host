import { createClient } from "@supabase/supabase-js";
import {
  createR2Client,
  decryptBuffer,
  getBuffer,
  getBackupPrefix,
  getJsonIfExists,
  requireEnv,
  sha256,
} from "./common.mjs";

if (process.env.ALLOW_STORAGE_RESTORE !== "RESTORE_TO_ISOLATED_PROJECT") {
  throw new Error("Ripristino bloccato. Imposta ALLOW_STORAGE_RESTORE=RESTORE_TO_ISOLATED_PROJECT.");
}

const targetUrl = requireEnv("RESTORE_TARGET_SUPABASE_URL");
const targetKey = requireEnv("RESTORE_TARGET_SUPABASE_SERVICE_ROLE_KEY");
const productionUrl = process.env.SUPABASE_URL?.trim();
if (productionUrl && targetUrl === productionUrl && process.env.ALLOW_PRODUCTION_RESTORE !== "I_ACCEPT_THE_RISK") {
  throw new Error("Ripristino sul progetto di produzione rifiutato.");
}

const r2 = createR2Client();
const prefix = getBackupPrefix();
const manifestKey = process.env.STORAGE_MANIFEST_KEY || `${prefix}/manifests/storage/latest.json`;
const manifest = await getJsonIfExists(r2, manifestKey);
if (!manifest) throw new Error(`Manifesto Storage non trovato: ${manifestKey}`);

const target = createClient(targetUrl, targetKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: existingBuckets, error: bucketsError } = await target.storage.listBuckets();
if (bucketsError) throw new Error(bucketsError.message);
const existing = new Set((existingBuckets || []).map((bucket) => bucket.id));

for (const bucket of manifest.buckets || []) {
  if (!existing.has(bucket.id)) {
    const { error } = await target.storage.createBucket(bucket.id, {
      public: Boolean(bucket.public),
      fileSizeLimit: bucket.fileSizeLimit || undefined,
      allowedMimeTypes: bucket.allowedMimeTypes || undefined,
    });
    if (error) throw new Error(`Creazione bucket ${bucket.id}: ${error.message}`);
  }
}

let restored = 0;
for (const object of manifest.objects || []) {
  const encrypted = await getBuffer(r2, object.blobKey);
  const plain = decryptBuffer(encrypted);
  if (sha256(plain) !== object.sha256) {
    throw new Error(`Checksum non valido per ${object.bucket}/${object.path}`);
  }
  const { error } = await target.storage.from(object.bucket).upload(object.path, plain, {
    contentType: object.contentType,
    upsert: true,
  });
  if (error) throw new Error(`Ripristino ${object.bucket}/${object.path}: ${error.message}`);
  restored += 1;
}

console.log(`Ripristinati ${restored} file nel progetto isolato.`);

