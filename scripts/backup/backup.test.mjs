import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { decryptBuffer, encryptBuffer } from "./common.mjs";

test("cifra e decifra buffer senza perdita", () => {
  process.env.BACKUP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const plain = randomBytes(4096);
  const encrypted = encryptBuffer(plain);
  assert.notDeepEqual(encrypted, plain);
  assert.deepEqual(decryptBuffer(encrypted), plain);
});

test("rileva un backup alterato", () => {
  process.env.BACKUP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const encrypted = encryptBuffer(Buffer.from("Lead Host"));
  encrypted[encrypted.length - 20] ^= 1;
  assert.throws(() => decryptBuffer(encrypted));
});

test("cifra e decifra un file con lo stesso checksum", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lead-host-backup-test-"));
  try {
    const plainPath = join(directory, "database.dump");
    const encryptedPath = join(directory, "database.dump.enc");
    const restoredPath = join(directory, "database-restored.dump");
    const plain = randomBytes(128 * 1024);
    const env = {
      ...process.env,
      BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    };
    await writeFile(plainPath, plain);

    const encrypt = spawnSync(process.execPath, ["scripts/backup/encrypt-file.mjs", "encrypt", plainPath, encryptedPath], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
    });
    assert.equal(encrypt.status, 0, encrypt.stderr);

    const decrypt = spawnSync(process.execPath, ["scripts/backup/encrypt-file.mjs", "decrypt", encryptedPath, restoredPath], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
    });
    assert.equal(decrypt.status, 0, decrypt.stderr);
    assert.deepEqual(await readFile(restoredPath), plain);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

