/**
 * Katalogdaki her modelin hangi istek parametrelerini desteklediğini ölçer.
 *
 * Model yetenekleri sürümden sürüme değişiyor (ör. effort parametresi bazı
 * modellerde yok). Tahmin etmek yerine ölçüp `ai_models` tablosundaki
 * bayrakları buna göre ayarlıyoruz.
 *
 *   npm run probe:models
 */
import { readFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";

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
  await fetch(`${SB}/rest/v1/ai_providers?select=api_key_encrypted&provider=eq.anthropic`, { headers })
).json()) as { api_key_encrypted: string }[];
const apiKey = env.ANTHROPIC_API_KEY || decrypt(prov!.api_key_encrypted, env.ENCRYPTION_KEY!);

const models = (await (
  await fetch(
    `${SB}/rest/v1/ai_models?select=id,model_key,display_name&provider=eq.anthropic&purpose=eq.chat&order=priority.asc`,
    { headers },
  )
).json()) as { id: string; model_key: string; display_name: string }[];

const schema = {
  type: "object",
  properties: { ok: { type: "boolean", description: "test" } },
  required: ["ok"],
  additionalProperties: false,
};

async function call(model: string, body: Record<string, unknown>) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16,
      messages: [{ role: "user", content: "test" }],
      ...body,
    }),
  });
  if (r.ok) return { ok: true as const };
  const b = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
  return { ok: false as const, message: b?.error?.message ?? String(r.status) };
}

console.log("Model yetenekleri ölçülüyor...\n");
const results: { id: string; model_key: string; effort: boolean }[] = [];

for (const model of models) {
  const withEffort = await call(model.model_key, {
    thinking: { type: "disabled" },
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
  });
  const withoutEffort = await call(model.model_key, {
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema } },
  });
  const thinkingDisabled = await call(model.model_key, { thinking: { type: "disabled" } });

  console.log(model.display_name.padEnd(20), `(${model.model_key})`);
  console.log(`  effort + şema      : ${withEffort.ok ? "DESTEKLİYOR" : "HAYIR — " + withEffort.message}`);
  console.log(`  şema (effort yok)  : ${withoutEffort.ok ? "DESTEKLİYOR" : "HAYIR — " + withoutEffort.message}`);
  console.log(`  thinking: disabled : ${thinkingDisabled.ok ? "DESTEKLİYOR" : "HAYIR — " + thinkingDisabled.message}`);
  console.log();

  results.push({ id: model.id, model_key: model.model_key, effort: withEffort.ok });
}

// Ölçüm sonucunu veritabanına yaz.
for (const result of results) {
  await fetch(`${SB}/rest/v1/ai_models?id=eq.${result.id}`, {
    method: "PATCH",
    headers: { ...headers, "content-type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ supports_effort: result.effort }),
  });
}
console.log("Sonuçlar ai_models tablosuna yazıldı (supports_effort).");
