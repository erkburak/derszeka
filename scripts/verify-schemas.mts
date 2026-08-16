/**
 * JSON şemalarını gerçek Anthropic API'sine karşı doğrular.
 *
 * Structured outputs, şemayı bir gramere derler ve bu gramerin bir boyut
 * sınırı vardır. Sınır aşılırsa istek 400 döner ("compiled grammar is too
 * large") — bu hata ancak çalışma zamanında görülür. Şema değiştirdiğinde
 * bu betiği çalıştır:
 *
 *   npm run verify:schemas
 *
 * Her şema için 16 token'lık bir istek atılır; maliyeti ihmal edilebilir.
 */
import { readFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";
import {
  answerEvaluationSchema,
  flashcardsSchema,
  guidedStepSchema,
  quizSchema,
  studyPlanSchema,
  studySetSchema,
} from "../src/lib/ai/schemas.ts";

const env: Record<string, string> = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match) env[match[1]!] = match[2]!.trim();
}

function decrypt(payload: string, keyHex: string): string {
  const [iv, tag, data] = payload.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keyHex, "hex"),
    Buffer.from(iv!, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag!, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data!, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function resolveApiKey(): Promise<string> {
  if (env.ANTHROPIC_API_KEY) return env.ANTHROPIC_API_KEY;

  const response = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/ai_providers?select=api_key_encrypted&provider=eq.anthropic`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  const rows = (await response.json()) as { api_key_encrypted: string | null }[];
  const encrypted = rows[0]?.api_key_encrypted;
  if (!encrypted) throw new Error("Anthropic anahtarı bulunamadı.");
  return decrypt(encrypted, env.ENCRYPTION_KEY!);
}

const apiKey = await resolveApiKey();
const model = process.argv[2] ?? "claude-opus-5";
let failed = 0;

async function check(name: string, schema: Record<string, unknown>) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16,
      thinking: { type: "disabled" },
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: "test" }],
    }),
  });

  if (response.ok) {
    console.log(`  OK    ${name}`);
    return;
  }
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  console.log(`  HATA  ${name}: ${body?.error?.message ?? response.status}`);
  failed += 1;
}

console.log(`Şemalar doğrulanıyor (model: ${model})\n`);
await check("studySetSchema", studySetSchema.schema);
await check("flashcardsSchema", flashcardsSchema.schema);
await check("quizSchema", quizSchema.schema);
await check("answerEvaluationSchema", answerEvaluationSchema.schema);
await check("studyPlanSchema", studyPlanSchema.schema);
await check("guidedStepSchema", guidedStepSchema.schema);

console.log(failed === 0 ? "\nTüm şemalar geçerli." : `\n${failed} şema geçersiz.`);
process.exit(failed === 0 ? 0 : 1);
