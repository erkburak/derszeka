import type { JsonSchemaSpec } from "@/lib/ai/provider";

/**
 * Şema zorlaması olmayan modeller için JSON desteği.
 *
 * Claude ve GPT şemayı API seviyesinde zorlayabiliyor. Açık modellerin
 * (Llama, Qwen, Mistral) çoğu bunu yapamaz; şemayı prompt'a gömüp çıktıyı
 * toleranslı biçimde ayrıştırmak gerekir. Bu dosya iki işi yapar:
 *  1. Şemayı modele okunur bir sözleşmeye çevirir.
 *  2. Kusurlu JSON çıktısını onarıp ayrıştırır.
 */

interface SchemaNode {
  type?: string | string[];
  description?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  enum?: unknown[];
  required?: string[];
}

/** Şemayı modelin anlayacağı, örnekli bir tarife dönüştürür. */
function describe(node: SchemaNode, indent = 0): string {
  const pad = "  ".repeat(indent);

  if (node.enum) {
    return `${node.enum.map((v) => JSON.stringify(v)).join(" | ")}`;
  }

  const type = Array.isArray(node.type) ? node.type[0] : node.type;

  if (type === "object" && node.properties) {
    const lines = Object.entries(node.properties).map(([key, child]) => {
      const comment = child.description ? `  // ${child.description}` : "";
      return `${pad}  ${JSON.stringify(key)}: ${describe(child, indent + 1)},${comment}`;
    });
    return `{\n${lines.join("\n")}\n${pad}}`;
  }

  if (type === "array" && node.items) {
    return `[ ${describe(node.items, indent)} ]`;
  }

  if (type === "integer" || type === "number") return "<sayı>";
  if (type === "boolean") return "true | false";
  return "<metin>";
}

export function buildJsonInstruction(schema: JsonSchemaSpec): string {
  return [
    "ÇIKTI BİÇİMİ — ÇOK ÖNEMLİ:",
    "Yanıtın YALNIZCA geçerli bir JSON nesnesi olmalı.",
    "Açıklama, giriş cümlesi, markdown kod bloğu veya ``` işareti EKLEME.",
    "Tüm alanları eksiksiz doldur; bilinmeyen sayısal alanlara 0, bilinmeyen",
    "metin alanlarına boş metin, boş listelere [] yaz.",
    "",
    "Beklenen yapı:",
    describe(schema.schema as SchemaNode),
  ].join("\n");
}

/**
 * Model çıktısını ayrıştırır. Küçük modellerin sık yaptığı hataları onarır:
 * kod bloğu sarmalama, baştaki/sondaki açıklama metni, sondaki fazla virgül,
 * akıllı tırnaklar, yarım kalan JSON.
 */
export function parseLooseJson<T>(raw: string): T | null {
  const attempts = [
    () => raw,
    () => stripCodeFence(raw),
    () => extractBalanced(stripCodeFence(raw)),
    () => repair(extractBalanced(stripCodeFence(raw)) ?? ""),
  ];

  for (const attempt of attempts) {
    const candidate = attempt();
    if (!candidate) continue;
    try {
      return JSON.parse(candidate.trim()) as T;
    } catch {
      // Sıradaki onarım denenir.
    }
  }
  return null;
}

function stripCodeFence(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1]! : text).trim();
}

/** İlk açılış parantezinden dengeli kapanışına kadar olan bölümü alır. */
function extractBalanced(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;

  const open = text[start]!;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i]!;

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  // Yarım kalmış JSON: açık kalan yapıları kapatmayı dene.
  return text.slice(start);
}

function repair(text: string): string {
  let result = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");

  // Yarım kalan dizgiyi kapat.
  const quotes = (result.match(/(?<!\\)"/g) ?? []).length;
  if (quotes % 2 === 1) result += '"';

  // Açık kalan parantezleri kapat.
  let depthCurly = 0;
  let depthSquare = 0;
  let inString = false;
  let escaped = false;

  for (const char of result) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depthCurly += 1;
    else if (char === "}") depthCurly -= 1;
    else if (char === "[") depthSquare += 1;
    else if (char === "]") depthSquare -= 1;
  }

  result += "]".repeat(Math.max(depthSquare, 0));
  result += "}".repeat(Math.max(depthCurly, 0));
  return result;
}
