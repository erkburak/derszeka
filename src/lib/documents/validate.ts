import "server-only";

import { AppError } from "@/lib/api";
import { getLimit } from "@/lib/limits";
import { getSettings } from "@/lib/settings";
import type { Profile } from "@/lib/types";

/** MIME tipini uzantıyla çapraz doğrula; yalnızca istemcinin dediğine güvenme. */
const EXTENSION_BY_MIME: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "text/plain": ["txt", "md"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
};

/** Dosya imzası (magic bytes) — uzantı ve MIME sahteciliğine karşı son kontrol. */
const SIGNATURES: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/webp", bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: [0x50, 0x4b, 0x03, 0x04],
  },
];

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "dosya";
  return (
    base
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}._-]+/gu, "_")
      .replace(/_{2,}/g, "_")
      .slice(0, 120) || "dosya"
  );
}

function matchesSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "text/plain") return true;
  const signature = SIGNATURES.find((entry) => entry.mime === mimeType);
  if (!signature) return false;
  const offset = signature.offset ?? 0;
  return signature.bytes.every((byte, index) => buffer[offset + index] === byte);
}

export async function validateUpload(params: {
  profile: Profile;
  filename: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}): Promise<{ safeName: string }> {
  const settings = await getSettings();
  const allowed = settings.allowed_mime_types;

  if (!allowed.includes(params.mimeType)) {
    throw new AppError(
      "Bu dosya türü desteklenmiyor. PDF, JPG, PNG, WEBP, TXT veya DOCX yükleyebilirsin.",
      415,
      "unsupported_media_type",
    );
  }

  const safeName = sanitizeFilename(params.filename);
  const extension = safeName.split(".").pop()?.toLowerCase() ?? "";
  const expected = EXTENSION_BY_MIME[params.mimeType] ?? [];
  if (expected.length > 0 && !expected.includes(extension)) {
    throw new AppError(
      "Dosya uzantısı içeriğiyle uyuşmuyor.",
      400,
      "extension_mismatch",
    );
  }

  if (!matchesSignature(params.buffer, params.mimeType)) {
    throw new AppError(
      "Dosya içeriği belirtilen türle uyuşmuyor.",
      400,
      "signature_mismatch",
    );
  }

  const maxMb = await getLimit(params.profile.plan, "max_file_size_mb");
  if (params.size > maxMb * 1024 * 1024) {
    throw new AppError(
      `Dosya boyutu ${maxMb} MB sınırını aşıyor.`,
      413,
      "file_too_large",
    );
  }

  if (params.size === 0) {
    throw new AppError("Dosya boş görünüyor.", 400, "empty_file");
  }

  return { safeName };
}
