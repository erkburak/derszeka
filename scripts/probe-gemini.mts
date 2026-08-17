/**
 * Gemini'nin şema ve embedding davranışını ölçer.
 *
 * Gemini `responseSchema` alanında tam JSON Schema değil, OpenAPI 3.0'ın
 * bir alt kümesini kabul ediyor. Hangi anahtarların geçtiğini tahmin etmek
 * yerine burada ölçüyoruz.
 *
 *   npm run probe:gemini
 */
import { readFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";
import { studySetSchema } from "../src/lib/ai/schemas.ts";

const env: Record<string, string> = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]!] = m[2]!.trim();
}
const SB = env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

function decrypt(payload: string, keyHex: string): string {
  const [iv, tag, data] = payload.split(".");
  const d = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(iv!, "base64"));
  d.setAuthTag(Buffer.from(tag!, "base64"));
  return Buffer.concat([d.update(Buffer.from(data!, "base64")), d.final()]).toString("utf8");
}

const [prov] = (await (
  await fetch(`${SB}/rest/v1/ai_providers?select=api_key_encrypted&provider=eq.google`, { headers })
).json()) as { api_key_encrypted: string | null }[];

if (!prov?.api_key_encrypted) {
  console.log("Gemini anahtarı veritabanında yok.");
  process.exit(1);
}
const apiKey = decrypt(prov.api_key_encrypted, env.ENCRYPTION_KEY!);
console.log(`Anahtar cozuldu: ...${apiKey.slice(-4)}\n`);

const BASE = "https://generativelanguage.googleapis.com/v1beta";

async function post(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  return { ok: r.ok, status: r.status, body: parsed, raw: text };
}

/* ---------------------------------------------------------------- şema dönüşümü */
type Node = Record<string, unknown>;

const GEMINI_TYPES: Record<string, string> = {
  string: "STRING", number: "NUMBER", integer: "INTEGER",
  boolean: "BOOLEAN", array: "ARRAY", object: "OBJECT",
};

function toGeminiSchema(node: Node): Node {
  const rawType = node.type;
  const types = Array.isArray(rawType) ? rawType : [rawType];
  const primary = types.find((t) => t !== "null") as string | undefined;
  const nullable = types.includes("null");

  const out: Node = {};
  if (primary) out.type = GEMINI_TYPES[primary] ?? "STRING";
  if (nullable) out.nullable = true;
  if (typeof node.description === "string") out.description = node.description;
  if (Array.isArray(node.enum)) out.enum = node.enum;

  if (node.properties) {
    const props: Node = {};
    for (const [key, value] of Object.entries(node.properties as Node)) {
      props[key] = toGeminiSchema(value as Node);
    }
    out.properties = props;
    if (Array.isArray(node.required)) out.required = node.required;
    out.propertyOrdering = Object.keys(props);
  }
  if (node.items) out.items = toGeminiSchema(node.items as Node);
  return out;
}

/* ---------------------------------------------------------------- testler */
console.log("1) Ham JSON Schema ile (mevcut kod):");
let r = await post("/models/gemini-2.5-flash:generateContent", {
  contents: [{ role: "user", parts: [{ text: "test" }] }],
  generationConfig: {
    maxOutputTokens: 64,
    responseMimeType: "application/json",
    responseSchema: studySetSchema.schema,
  },
});
console.log(r.ok ? "   BASARILI" : `   HATA ${r.status}: ${r.raw.slice(0, 180)}\n`);

console.log("2) Gemini'ye uyarlanmis sema ile:");
r = await post("/models/gemini-2.5-flash:generateContent", {
  contents: [{ role: "user", parts: [{ text: "Matematik temel kavramlar hakkinda kisa bir calisma seti uret." }] }],
  generationConfig: {
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
    responseSchema: toGeminiSchema(studySetSchema.schema as Node),
  },
});
console.log(r.ok ? "   BASARILI" : `   HATA ${r.status}: ${r.raw.slice(0, 400)}\n`);

console.log("\n3) Embedding — gemini-embedding-001, 1536 boyut:");
r = await post("/models/gemini-embedding-001:batchEmbedContents", {
  requests: [
    { model: "models/gemini-embedding-001", content: { parts: [{ text: "deneme metni" }] }, outputDimensionality: 1536 },
  ],
});
if (r.ok) {
  const b = r.body as { embeddings?: { values: number[] }[] };
  console.log(`   BASARILI — boyut: ${b.embeddings?.[0]?.values?.length}`);
} else {
  console.log(`   HATA ${r.status}: ${r.raw.slice(0, 300)}`);
}

console.log("\n4) Embedding — text-embedding-004 (alternatif):");
r = await post("/models/text-embedding-004:batchEmbedContents", {
  requests: [{ model: "models/text-embedding-004", content: { parts: [{ text: "deneme" }] }, outputDimensionality: 1536 }],
});
if (r.ok) {
  const b = r.body as { embeddings?: { values: number[] }[] };
  console.log(`   BASARILI — boyut: ${b.embeddings?.[0]?.values?.length}`);
} else {
  console.log(`   HATA ${r.status}: ${r.raw.slice(0, 300)}`);
}
