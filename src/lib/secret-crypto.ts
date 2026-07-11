import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";

function parseEncryptionKey(): Buffer {
  const raw = process.env.DRIVE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("DRIVE_TOKEN_ENCRYPTION_KEY is not configured.");
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("DRIVE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
  }
  return key;
}

export function hasSecretEncryptionKey(): boolean {
  return !!process.env.DRIVE_TOKEN_ENCRYPTION_KEY?.trim();
}

export function encryptSecret(plaintext: string): string {
  const key = parseEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${ciphertext.toString("base64url")}:${tag.toString("base64url")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) {
    return stored;
  }
  const key = parseEncryptionKey();
  const payload = stored.slice(PREFIX.length);
  const [ivPart, ciphertextPart, tagPart] = payload.split(":");
  if (!ivPart || !ciphertextPart || !tagPart) {
    throw new Error("Invalid encrypted secret format.");
  }
  const iv = Buffer.from(ivPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
