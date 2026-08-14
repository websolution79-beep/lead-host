import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { finished, pipeline } from "node:stream/promises";
import { getEncryptionKey } from "./common.mjs";

const MAGIC = Buffer.from("LHBK0001", "ascii");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

async function encryptFile(inputPath, outputPath) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const output = createWriteStream(outputPath, { flags: "wx" });
  output.write(MAGIC);
  output.write(iv);
  await pipeline(createReadStream(inputPath), cipher, output, { end: false });
  output.end(cipher.getAuthTag());
  await finished(output);
}

async function decryptFile(inputPath, outputPath) {
  const stat = await fs.stat(inputPath);
  const headerLength = MAGIC.length + IV_LENGTH;
  if (stat.size <= headerLength + TAG_LENGTH) {
    throw new Error("Backup cifrato troppo piccolo.");
  }
  const handle = await fs.open(inputPath, "r");
  const header = Buffer.alloc(headerLength);
  const tag = Buffer.alloc(TAG_LENGTH);
  await handle.read(header, 0, header.length, 0);
  await handle.read(tag, 0, tag.length, stat.size - TAG_LENGTH);
  await handle.close();

  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Formato backup non riconosciuto.");
  }
  const iv = header.subarray(MAGIC.length);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  await pipeline(
    createReadStream(inputPath, { start: headerLength, end: stat.size - TAG_LENGTH - 1 }),
    decipher,
    createWriteStream(outputPath, { flags: "wx" }),
  );
}

const [operation, inputPath, outputPath] = process.argv.slice(2);
if (!operation || !inputPath || !outputPath || !["encrypt", "decrypt"].includes(operation)) {
  throw new Error("Uso: node encrypt-file.mjs <encrypt|decrypt> <input> <output>");
}

if (operation === "encrypt") {
  await encryptFile(inputPath, outputPath);
} else {
  await decryptFile(inputPath, outputPath);
}

console.log(`${operation === "encrypt" ? "Cifratura" : "Decifratura"} completata: ${outputPath}`);
