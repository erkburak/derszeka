/**
 * Materyal analizi çağrısını birebir aynı parametrelerle, doğrudan çalıştırır.
 * Amaç: uygulamada kaydı hiç oluşmayan çağrının gerçekte ne yaptığını görmek
 * (hata mı veriyor, asılı mı kalıyor, ne kadar sürüyor).
 *
 *   npm run debug:analysis
 */
import { readFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";
import { studySetSchema } from "../src/lib/ai/schemas.ts";
import { documentAnalysisPrompt } from "../src/lib/ai/prompts.ts";

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

const provRes = await fetch(
  `${SB}/rest/v1/ai_providers?select=api_key_encrypted&provider=eq.anthropic`,
  { headers },
);
const [prov] = (await provRes.json()) as { api_key_encrypted: string }[];
const apiKey = env.ANTHROPIC_API_KEY || decrypt(prov!.api_key_encrypted, env.ENCRYPTION_KEY!);

// --- Belge metnini uygulamadaki gibi kur -----------------------------------
const docRes = await fetch(
  `${SB}/rest/v1/documents?select=id,title,page_count,char_count&order=created_at.desc&limit=1`,
  { headers },
);
const [doc] = (await docRes.json()) as {
  id: string;
  title: string;
  page_count: number;
  char_count: number;
}[];

if (!doc) {
  console.log("Veritabanında materyal yok. Önce bir dosya yükle.");
  process.exit(1);
}

const pagesRes = await fetch(
  `${SB}/rest/v1/document_pages?select=page_number,content&document_id=eq.${doc.id}&order=page_number.asc`,
  { headers },
);
const pages = (await pagesRes.json()) as { page_number: number; content: string }[];

const text = pages
  .map((p) => `[[SAYFA ${p.page_number}]]\n${p.content}`)
  .join("\n\n");

console.log(`Materyal : ${doc.title}`);
console.log(`Sayfa    : ${pages.length}`);
console.log(`Karakter : ${text.length}  (~${Math.ceil(text.length / 3.6)} token)`);
console.log(`Model    : claude-opus-5, max_tokens 16000, effort medium, thinking disabled`);
console.log("\nİstek gönderiliyor...\n");

const started = Date.now();
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 8 * 60_000);

try {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: documentAnalysisPrompt,
      thinking: { type: "disabled" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: studySetSchema.schema },
      },
      messages: [
        {
          role: "user",
          content: `Materyal adı: ${doc.title}\n\nMATERYAL İÇERİĞİ:\n\n${text}`,
        },
      ],
    }),
  });

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const body = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    console.log(`HATA ${response.status} — ${seconds} sn`);
    console.log(JSON.stringify(body, null, 2).slice(0, 1500));
  } else {
    const usage = body.usage as { input_tokens: number; output_tokens: number };
    const content = body.content as { type: string; text?: string }[];
    const out = content.find((b) => b.type === "text")?.text ?? "";
    console.log(`BASARILI — ${seconds} sn`);
    console.log(`stop_reason  : ${body.stop_reason}`);
    console.log(`input tokens : ${usage.input_tokens}`);
    console.log(`output tokens: ${usage.output_tokens}`);
    console.log(`JSON parse   : ${(() => { try { JSON.parse(out); return "gecerli"; } catch { return "GECERSIZ"; } })()}`);
    console.log(`\nCiktinin ilk 400 karakteri:\n${out.slice(0, 400)}`);
  }
} catch (error) {
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`ISTISNA — ${seconds} sn sonra`);
  console.log(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
} finally {
  clearTimeout(timeout);
}
