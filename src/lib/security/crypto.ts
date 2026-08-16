import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { serverEnv } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function key(): Buffer {
  const raw = serverEnv.encryptionKey;
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY 32 byte (64 hex karakter) olmalıdır.");
  }
  return buf;
}

/**
 * Sağlayıcı API anahtarlarını veritabanında şifreli tutar.
 * Format: base64(iv).base64(authTag).base64(ciphertext)
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Şifreli değer bozuk.");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Panelde gösterilecek maskeli ipucu: "…9f2a" */
export function secretHint(plain: string): string {
  return `…${plain.slice(-4)}`;
}
