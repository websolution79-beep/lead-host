import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import {
  createR2Client,
  encryptBuffer,
  getBackupPrefix,
  getJsonIfExists,
  objectExists,
  putBuffer,
  putJson,
  requireEnv,
  sha256,
} from "./common.mjs";

const supabaseUrl = requireEnv("SUPABASE_URL");
const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const timestamp = requireEnv("BACKUP_TIMESTAMP");
const prefix = getBackupPrefix();
const r2 = createR2Client();
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function listFolder(bucket, folder = "") {
  const objects = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Errore elenco ${bucket}/${folder}: ${error.message}`);
    for (const item of data || []) {
      const path = folder ? `${folder}/${item.name}` : item.name;
      if (!item.id && !item.metadata) {
        objects.push(...await listFolder(bucket, path));
      } else {
        objects.push({
          path,
          size: Number(item.metadata?.size || 0),
          contentType: item.metadata?.mimetype || "application/octet-stream",
          updatedAt: item.updated_at || item.created_at || null,
        });
      }
    }
    if (!data || data.length < limit) break;
    offset += limit;
  }
  return objects;
}

const latestKey = `${prefix}/manifests/storage/latest.json`;
const previous = await getJsonIfExists(r2, latestKey);
const previousByPath = new Map((previous?.objects || []).map((item) => [`${item.bucket}/${item.path}`, item]));
const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
if (bucketError) throw new Error(`Errore elenco bucket: ${bucketError.message}`);

const manifestObjects = [];
let uploaded = 0;
let reused = 0;
for (const bucket of buckets || []) {
  const objects = await listFolder(bucket.id);
  for (const object of objects) {
    const identity = `${bucket.id}/${object.path}`;
    const previousObject = previousByPath.get(identity);
    if (
      previousObject &&
      previousObject.updatedAt === object.updatedAt &&
      previousObject.size === object.size &&
      previousObject.blobKey
    ) {
      manifestObjects.push({ ...previousObject, contentType: object.contentType });
      reused += 1;
      continue;
    }

    const { data, error } = await supabase.storage.from(bucket.id).download(object.path);
    if (error) throw new Error(`Errore download ${identity}: ${error.message}`);
    const plain = Buffer.from(await data.arrayBuffer());
    const digest = sha256(plain);
    const blobKey = `${prefix}/storage/blobs/${digest}.enc`;
    if (!(await objectExists(r2, blobKey))) {
      await putBuffer(r2, blobKey, encryptBuffer(plain));
      uploaded += 1;
    } else {
      reused += 1;
    }
    manifestObjects.push({
      bucket: bucket.id,
      path: object.path,
      size: plain.length,
      contentType: object.contentType,
      updatedAt: object.updatedAt,
      sha256: digest,
      blobKey,
    });
  }
}

manifestObjects.sort((a, b) => `${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`));
const manifest = {
  version: 1,
  kind: "supabase-storage-content-addressed-backup",
  createdAt: new Date().toISOString(),
  timestamp,
  sourceUrl: supabaseUrl,
  buckets: (buckets || []).map((bucket) => ({
    id: bucket.id,
    name: bucket.name,
    public: bucket.public,
    fileSizeLimit: bucket.file_size_limit,
    allowedMimeTypes: bucket.allowed_mime_types,
  })),
  objects: manifestObjects,
  stats: { objects: manifestObjects.length, uploaded, reused },
};

await putJson(r2, `${prefix}/manifests/storage/${timestamp}.json`, manifest);
await putJson(r2, latestKey, manifest);
if (process.env.GITHUB_OUTPUT) {
  await fs.appendFile(
    process.env.GITHUB_OUTPUT,
    `objects=${manifestObjects.length}\nuploaded=${uploaded}\nreused=${reused}\n`,
  );
}
console.log(JSON.stringify(manifest.stats, null, 2));
