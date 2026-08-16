import "server-only";

import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { runChat } from "@/lib/ai/service";
import { AppError } from "@/lib/api";
import type { Profile } from "@/lib/types";

export interface ExtractedPage {
  pageNumber: number;
  content: string;
  method: "text" | "vision" | "ocr";
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  method: string;
  charCount: number;
  truncated: boolean;
}

/** Bu yoğunluğun altındaki PDF'ler taranmış kabul edilip görsel okumaya düşer. */
const SCANNED_PDF_CHAR_THRESHOLD = 120;
const PAGE_MARKER = /\[\[\s*SAYFA\s+(\d+)\s*\]\]/gi;

const OCR_SYSTEM = `Sen bir ders materyali dijitalleştirme uzmanısın.
Verilen belgedeki TÜM metni eksiksiz ve olduğu gibi yazıya dök.

Kurallar:
- Her sayfanın başına [[SAYFA n]] etiketi koy (n = sayfa numarası).
- Metni yorumlama, özetleme veya düzeltme. Yazılanı aynen aktar.
- Tabloları Markdown tablosu olarak yaz.
- Formülleri düz metin olarak yaz (bölme için /, üs için ^).
- Grafik veya şema varsa "[GÖRSEL: ...]" biçiminde kısa bir açıklama ekle.
- El yazısını okuyabildiğin kadar aktar; emin olmadığın kelimeyi [?] ile işaretle.
- Yanıtına açıklama, giriş veya sonuç cümlesi ekleme; yalnızca çıkarılan metni ver.
- İçe dönük veya sistem XML etiketleri kullanma.`;

function splitByPageMarkers(
  raw: string,
  method: "vision" | "ocr",
  fallbackStart = 1,
): ExtractedPage[] {
  const matches = [...raw.matchAll(PAGE_MARKER)];
  if (matches.length === 0) {
    const content = raw.trim();
    return content ? [{ pageNumber: fallbackStart, content, method }] : [];
  }

  const pages: ExtractedPage[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]!;
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : raw.length;
    const content = raw.slice(start, end).trim();
    if (content) {
      pages.push({
        pageNumber: Number(match[1]) || fallbackStart + i,
        content,
        method,
      });
    }
  }
  return pages;
}

async function visionExtract(params: {
  profile: Profile;
  documentId: string;
  part:
    | { kind: "pdf"; dataBase64: string }
    | { kind: "image"; mediaType: string; dataBase64: string };
  instruction: string;
}): Promise<string> {
  const response = await runChat({
    profile: params.profile,
    operation: "OCR",
    documentId: params.documentId,
    system: OCR_SYSTEM,
    maxOutputTokens: 16000,
    needs: params.part.kind === "pdf" ? { pdf: true } : { vision: true },
    messages: [
      {
        role: "user",
        content: [params.part, { kind: "text", text: params.instruction }],
      },
    ],
    skipQuota: true,
  });
  return response.text;
}

async function extractPdf(
  buffer: Buffer,
  profile: Profile,
  documentId: string,
  maxPages: number,
): Promise<ExtractionResult> {
  const bytes = new Uint8Array(buffer);
  let pageTexts: string[] = [];
  let totalPages = 0;

  try {
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: false });
    totalPages = result.totalPages;
    pageTexts = (result.text as string[]).map((t) => (t ?? "").trim());
  } catch {
    // Bozuk veya şifreli PDF: doğrudan görsel okumaya düş.
    pageTexts = [];
  }

  const truncated = totalPages > maxPages;
  const consideredPages = pageTexts.slice(0, maxPages);
  const totalChars = consideredPages.reduce((sum, t) => sum + t.length, 0);
  const density = consideredPages.length > 0 ? totalChars / consideredPages.length : 0;

  if (consideredPages.length > 0 && density >= SCANNED_PDF_CHAR_THRESHOLD) {
    const pages = consideredPages
      .map((content, index) => ({
        pageNumber: index + 1,
        content,
        method: "text" as const,
      }))
      .filter((page) => page.content.length > 0);

    return {
      pages,
      method: "text",
      charCount: pages.reduce((sum, p) => sum + p.content.length, 0),
      truncated,
    };
  }

  // Taranmış PDF: belgeyi doğrudan görsel yeteneği olan modele gönder.
  const raw = await visionExtract({
    profile,
    documentId,
    part: { kind: "pdf", dataBase64: buffer.toString("base64") },
    instruction: `Bu PDF'in ilk ${maxPages} sayfasındaki tüm metni çıkar.`,
  });

  const pages = splitByPageMarkers(raw, "vision");
  return {
    pages,
    method: "vision",
    charCount: pages.reduce((sum, p) => sum + p.content.length, 0),
    truncated,
  };
}

async function extractImage(
  buffer: Buffer,
  mimeType: string,
  profile: Profile,
  documentId: string,
): Promise<ExtractionResult> {
  const raw = await visionExtract({
    profile,
    documentId,
    part: {
      kind: "image",
      mediaType: mimeType,
      dataBase64: buffer.toString("base64"),
    },
    instruction:
      "Bu görseldeki tüm metni çıkar. Ders notu, kitap sayfası veya el yazısı olabilir.",
  });

  const pages = splitByPageMarkers(raw, "vision");
  return {
    pages: pages.length > 0 ? pages : [{ pageNumber: 1, content: raw.trim(), method: "vision" }],
    method: "vision",
    charCount: raw.length,
    truncated: false,
  };
}

/** Uzun düz metni sayfa benzeri bloklara böler ki kaynak gösterimi çalışsın. */
function paginateText(text: string, charsPerPage = 3000): ExtractedPage[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const pages: ExtractedPage[] = [];
  const paragraphs = clean.split(/\n{2,}/);
  let buffer = "";
  let pageNumber = 1;

  for (const paragraph of paragraphs) {
    if (buffer.length + paragraph.length > charsPerPage && buffer.length > 0) {
      pages.push({ pageNumber: pageNumber++, content: buffer.trim(), method: "text" });
      buffer = "";
    }
    buffer += `${paragraph}\n\n`;
  }
  if (buffer.trim()) {
    pages.push({ pageNumber, content: buffer.trim(), method: "text" });
  }
  return pages;
}

export async function extractDocument(params: {
  buffer: Buffer;
  mimeType: string;
  profile: Profile;
  documentId: string;
  maxPages: number;
}): Promise<ExtractionResult> {
  const { buffer, mimeType, profile, documentId, maxPages } = params;

  if (mimeType === "application/pdf") {
    return extractPdf(buffer, profile, documentId, maxPages);
  }

  if (mimeType.startsWith("image/")) {
    return extractImage(buffer, mimeType, profile, documentId);
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const { value } = await mammoth.extractRawText({ buffer });
    const pages = paginateText(value).slice(0, maxPages);
    return {
      pages,
      method: "text",
      charCount: pages.reduce((sum, p) => sum + p.content.length, 0),
      truncated: false,
    };
  }

  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    const pages = paginateText(buffer.toString("utf8")).slice(0, maxPages);
    return {
      pages,
      method: "text",
      charCount: pages.reduce((sum, p) => sum + p.content.length, 0),
      truncated: false,
    };
  }

  throw new AppError(
    "Bu dosya türü henüz desteklenmiyor.",
    415,
    "unsupported_media_type",
  );
}

export { paginateText };
