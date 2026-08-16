import type { ExtractedPage } from "@/lib/documents/extract";

export interface DocumentChunk {
  chunkIndex: number;
  content: string;
  pageFrom: number;
  pageTo: number;
  sectionTitle: string | null;
  tokenEstimate: number;
}

/** Türkçe/İngilizce karışık metin için pratik yaklaşım: ~3.6 karakter ≈ 1 token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.6);
}

/** Markdown/ders notu başlıklarını yakalar; chunk'lara bölüm adı verir. */
function detectHeading(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) return null;
  if (/^#{1,6}\s+\S/.test(trimmed)) return trimmed.replace(/^#{1,6}\s+/, "");
  if (/^(\d+(\.\d+)*)[.)]\s+\S/.test(trimmed) && trimmed.length < 90) return trimmed;
  if (/^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ\s\d.,:'-]{6,}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Sayfa sınırlarını koruyarak örtüşmeli parçalar üretir.
 * Örtüşme, cümlenin ortasından bölünen bilginin kaybolmasını engeller.
 */
export function chunkPages(
  pages: ExtractedPage[],
  options: { chunkSize: number; overlap: number },
): DocumentChunk[] {
  const chunkSize = Math.max(400, options.chunkSize);
  const overlap = Math.min(Math.max(0, options.overlap), Math.floor(chunkSize / 3));

  const chunks: DocumentChunk[] = [];
  let buffer = "";
  let bufferPageFrom = pages[0]?.pageNumber ?? 1;
  let bufferPageTo = bufferPageFrom;
  let currentSection: string | null = null;
  let sectionForBuffer: string | null = null;

  const flush = () => {
    const content = buffer.trim();
    if (!content) {
      buffer = "";
      return;
    }
    chunks.push({
      chunkIndex: chunks.length,
      content,
      pageFrom: bufferPageFrom,
      pageTo: bufferPageTo,
      sectionTitle: sectionForBuffer,
      tokenEstimate: estimateTokens(content),
    });

    const tail = overlap > 0 ? content.slice(-overlap) : "";
    buffer = tail ? `${tail}\n` : "";
    bufferPageFrom = bufferPageTo;
    sectionForBuffer = currentSection;
  };

  for (const page of pages) {
    for (const line of page.content.split("\n")) {
      const heading = detectHeading(line);
      if (heading) {
        currentSection = heading;
        sectionForBuffer ??= heading;
      }

      if (buffer.length + line.length + 1 > chunkSize) {
        flush();
        bufferPageFrom = page.pageNumber;
      }

      buffer += `${line}\n`;
      bufferPageTo = page.pageNumber;
      if (buffer.trim().length === line.trim().length) {
        bufferPageFrom = page.pageNumber;
        sectionForBuffer = currentSection;
      }
    }
  }

  flush();
  // Son flush örtüşme kuyruğu bırakabilir; anlamsız artığı at.
  const last = chunks[chunks.length - 1];
  if (last && last.content.length < 40 && chunks.length > 1) chunks.pop();

  return chunks.map((chunk, index) => ({ ...chunk, chunkIndex: index }));
}

/** Model bağlamına sığdırmak için metni token bütçesine göre kırpar. */
export function clampToTokens(text: string, maxTokens: number): string {
  const maxChars = Math.floor(maxTokens * 3.6);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[... materyalin devamı uzunluk sınırı nedeniyle kısaltıldı ...]`;
}
