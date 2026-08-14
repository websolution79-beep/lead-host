import {
  createR2Client,
  getBackupPrefix,
  getJsonIfExists,
  objectExists,
} from "./common.mjs";

const r2 = createR2Client();
const prefix = getBackupPrefix();
const database = await getJsonIfExists(r2, `${prefix}/manifests/database/latest.json`);
const storage = await getJsonIfExists(r2, `${prefix}/manifests/storage/latest.json`);

if (!database || !(await objectExists(r2, database.objectKey))) {
  throw new Error("Ultimo backup database non trovato o incompleto.");
}
if (!storage) throw new Error("Manifesto Storage non trovato.");

const sample = (storage.objects || []).slice(0, 10);
for (const object of sample) {
  if (!(await objectExists(r2, object.blobKey))) {
    throw new Error(`Blob Storage mancante: ${object.blobKey}`);
  }
}

console.log(JSON.stringify({
  database: { createdAt: database.createdAt, bytes: database.encryptedBytes },
  storage: { createdAt: storage.createdAt, objects: storage.stats?.objects || 0 },
  sampledStorageObjects: sample.length,
}, null, 2));

