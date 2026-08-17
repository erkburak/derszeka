import "server-only";

import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { GoogleProvider } from "@/lib/ai/providers/google";
import { CompatibleProvider } from "@/lib/ai/providers/compatible";
import { AIProviderError } from "@/lib/ai/errors";
import { buildJsonInstruction, parseLooseJson } from "@/lib/ai/json";
import type {
  AIMessage,
  AIProvider,
  ChatResponse,
  JsonSchemaSpec,
} from "@/lib/ai/provider";
import { decryptSecret } from "@/lib/security/crypto";
import { createAdminSupabase } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import {
  assertWithinLimit,
  getLimit,
  incrementUsage,
} from "@/lib/limits";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import type { AIModelRow, AIOperation, AIProviderName, Profile } from "@/lib/types";

const PROVIDER_TTL_MS = 60_000;
let providerCache: {
  at: number;
  instances: Partial<Record<AIProviderName, AIProvider>>;
} | null = null;
let modelCache: { at: number; rows: AIModelRow[] } | null = null;
let routingCache: { at: number; map: Map<AIOperation, string> } | null = null;

/** İşlem → model eşlemesi; her işlem kendi maliyet/kalite dengesiyle çalışır. */
async function loadRouting(): Promise<Map<AIOperation, string>> {
  if (routingCache && Date.now() - routingCache.at < PROVIDER_TTL_MS) {
    return routingCache.map;
  }
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("ai_operation_models")
    .select("operation, model_id")
    .not("model_id", "is", null);

  const map = new Map<AIOperation, string>(
    (data ?? []).map((row) => [row.operation as AIOperation, row.model_id as string]),
  );
  routingCache = { at: Date.now(), map };
  return map;
}

async function loadModels(): Promise<AIModelRow[]> {
  if (modelCache && Date.now() - modelCache.at < PROVIDER_TTL_MS) {
    return modelCache.rows;
  }
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("ai_models")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: true });
  const rows = (data ?? []) as AIModelRow[];
  modelCache = { at: Date.now(), rows };
  return rows;
}

/**
 * Sağlayıcı anahtarı önce veritabanından (şifreli, admin panelinden yönetilir),
 * yoksa ortam değişkeninden alınır. Anahtar hiçbir zaman istemciye gitmez.
 */
async function resolveProvider(name: AIProviderName): Promise<AIProvider> {
  if (providerCache && Date.now() - providerCache.at < PROVIDER_TTL_MS) {
    const cached = providerCache.instances[name];
    if (cached) return cached;
  } else {
    providerCache = { at: Date.now(), instances: {} };
  }

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("ai_providers")
    .select("provider, is_enabled, api_key_encrypted, base_url")
    .eq("provider", name)
    .maybeSingle();

  if (data && data.is_enabled === false) {
    throw new AIProviderError(
      "Bu yapay zekâ sağlayıcısı şu anda kapalı.",
      name,
      "auth",
      503,
      `provider ${name} disabled by admin`,
      false,
    );
  }

  let apiKey: string | undefined;
  if (data?.api_key_encrypted) {
    try {
      apiKey = decryptSecret(data.api_key_encrypted);
    } catch {
      apiKey = undefined;
    }
  }
  apiKey ??= serverEnv.providerKeys[name as keyof typeof serverEnv.providerKeys];

  // Kendi sunucunda çalışan modeller (Ollama, vLLM) anahtar istemez.
  if (!apiKey && name === "compatible") apiKey = "local";

  if (!apiKey) {
    throw new AIProviderError(
      "Yapay zekâ servisi henüz yapılandırılmamış.",
      name,
      "auth",
      503,
      `missing api key for provider ${name}`,
      false,
    );
  }

  const baseUrl = data?.base_url ?? undefined;
  const instance: AIProvider =
    name === "anthropic"
      ? new AnthropicProvider(apiKey, baseUrl)
      : name === "openai"
        ? new OpenAIProvider(apiKey, baseUrl)
        : name === "google"
          ? new GoogleProvider(apiKey, baseUrl)
          : new CompatibleProvider(apiKey, baseUrl);

  providerCache.instances[name] = instance;
  return instance;
}

export function invalidateAICache() {
  providerCache = null;
  modelCache = null;
  routingCache = null;
}

interface ModelSelection {
  model: AIModelRow;
  provider: AIProvider;
}

async function selectModel(
  profile: Profile,
  purpose: "chat" | "embedding",
  needs: { vision?: boolean; pdf?: boolean } = {},
  operation?: AIOperation,
): Promise<ModelSelection> {
  const models = await loadModels();
  const advanced = (await getLimit(profile.plan, "feature_advanced_models")) > 0;

  const usable = models
    .filter((m) => m.purpose === purpose)
    .filter((m) => (needs.vision ? m.supports_vision : true))
    .filter((m) => (needs.pdf ? m.supports_pdf : true))
    .filter((m) => (m.requires_premium ? advanced : true));

  // İşleme atanmış model varsa ve kullanıcı ona erişebiliyorsa önce o denenir.
  let routed: AIModelRow | undefined;
  if (operation) {
    const routing = await loadRouting();
    const routedId = routing.get(operation);
    if (routedId) routed = usable.find((m) => m.id === routedId);
  }

  const rest = usable
    .filter((m) => m.id !== routed?.id)
    .sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.priority - b.priority;
    });

  const candidates = routed ? [routed, ...rest] : rest;

  for (const model of candidates) {
    try {
      return { model, provider: await resolveProvider(model.provider) };
    } catch {
      // Anahtarı olmayan sağlayıcıyı atla, sıradakini dene.
    }
  }

  throw new AIProviderError(
    "Yapay zekâ servisi şu anda kullanılamıyor.",
    "anthropic",
    "auth",
    503,
    `no usable model for purpose=${purpose} needs=${JSON.stringify(needs)}`,
    false,
  );
}

function computeCost(
  model: AIModelRow,
  usage: { inputTokens: number; outputTokens: number },
  usdTryRate: number,
) {
  const usd =
    (usage.inputTokens / 1_000_000) * Number(model.input_price_per_1m) +
    (usage.outputTokens / 1_000_000) * Number(model.output_price_per_1m);
  return { usd, try: usd * usdTryRate };
}

async function recordRequest(params: {
  profile: Profile | null;
  model: AIModelRow;
  operation: AIOperation;
  documentId?: string | null;
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number };
  durationMs: number;
  status: "success" | "error";
  errorCode?: string;
  errorMessage?: string;
  meta?: Record<string, unknown>;
}) {
  const settings = await getSettings();
  const cost = computeCost(params.model, params.usage, Number(settings.usd_try_rate));
  const supabase = createAdminSupabase();

  await supabase.from("ai_requests").insert({
    user_id: params.profile?.id ?? null,
    user_plan: params.profile?.plan ?? null,
    provider: params.model.provider,
    model_key: params.model.model_key,
    operation: params.operation,
    document_id: params.documentId ?? null,
    input_tokens: params.usage.inputTokens,
    output_tokens: params.usage.outputTokens,
    total_tokens: params.usage.inputTokens + params.usage.outputTokens,
    cached_tokens: params.usage.cachedTokens,
    cost_usd: cost.usd,
    cost_try: cost.try,
    duration_ms: params.durationMs,
    status: params.status,
    error_code: params.errorCode ?? null,
    error_message: params.errorMessage ?? null,
    meta: params.meta ?? {},
  });

  if (params.profile) {
    const total = params.usage.inputTokens + params.usage.outputTokens;
    // Maliyet kuruş (sent) olarak sayılır; yuvarlama kaybını önlemek için
    // yukarı yuvarlanır — tavan böylece asla aşılmaz.
    const cents = Math.ceil(cost.usd * 100);

    await Promise.all([
      incrementUsage(params.profile.id, "ai_requests", "day", 1),
      incrementUsage(params.profile.id, "tokens", "day", total),
      incrementUsage(params.profile.id, "tokens", "month", total),
      incrementUsage(params.profile.id, "cost_cents", "day", cents),
      incrementUsage(params.profile.id, "cost_cents", "month", cents),
    ]);
  }
}

export interface RunChatOptions {
  profile: Profile;
  operation: AIOperation;
  system?: string;
  messages: AIMessage[];
  maxOutputTokens?: number;
  jsonSchema?: JsonSchemaSpec;
  documentId?: string | null;
  needs?: { vision?: boolean; pdf?: boolean };
  /** Limit sayaçlarını atlamak için (arka plan işleri zaten kotayı düşmüştür). */
  skipQuota?: boolean;
  meta?: Record<string, unknown>;
}

/**
 * Tüm sohbet/üretim istekleri buradan geçer:
 * kota → rate limit → model seçimi → çağrı → token & maliyet kaydı.
 */
export async function runChat(options: RunChatOptions): Promise<ChatResponse> {
  const { profile } = options;
  const settings = await getSettings();

  if (!options.skipQuota) {
    await enforceRateLimit(
      "ai",
      profile.id,
      Number(settings.rate_limit_ai_per_minute),
      60,
    );
    await assertWithinLimit(profile, "daily_ai_requests", "ai_requests", "day");
    await assertWithinLimit(profile, "daily_tokens", "tokens", "day");
    await assertWithinLimit(profile, "monthly_tokens", "tokens", "month");
  }

  // Maliyet tavanı arka plan işlerinde de geçerli: asıl güvenlik ağı budur.
  await assertWithinLimit(profile, "daily_cost_cents", "cost_cents", "day");
  await assertWithinLimit(profile, "monthly_cost_cents", "cost_cents", "month");

  const { model, provider } = await selectModel(
    profile,
    "chat",
    options.needs,
    options.operation,
  );
  const planMaxOutput = await getLimit(profile.plan, "max_output_tokens");
  const maxOutputTokens = Math.min(
    options.maxOutputTokens ?? planMaxOutput,
    planMaxOutput,
    model.max_output_tokens,
  );

  // Şemayı API seviyesinde zorlayamayan modellerde (açık modellerin çoğu)
  // sözleşme prompt'a gömülür; yanıt sonra toleranslı biçimde ayrıştırılır.
  const nativeSchema = Boolean(options.jsonSchema) && model.supports_json_schema;
  const system =
    options.jsonSchema && !nativeSchema
      ? [options.system, buildJsonInstruction(options.jsonSchema)]
          .filter(Boolean)
          .join("\n\n")
      : options.system;

  const startedAt = Date.now();
  try {
    const response = await provider.chat(model.model_key, {
      system,
      messages: options.messages,
      maxOutputTokens,
      jsonSchema: options.jsonSchema,
      jsonSchemaNative: nativeSchema,
      // Desteklemeyen modellere effort gönderilmez; API aksi hâlde 400 döner.
      effort: model.supports_effort
        ? (settings.ai_effort as "low" | "medium" | "high")
        : undefined,
    });

    await recordRequest({
      profile,
      model,
      operation: options.operation,
      documentId: options.documentId,
      usage: response.usage,
      durationMs: Date.now() - startedAt,
      status: "success",
      meta: options.meta,
    });

    return response;
  } catch (error) {
    const aiError = error instanceof AIProviderError ? error : null;
    await recordRequest({
      profile,
      model,
      operation: options.operation,
      documentId: options.documentId,
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      durationMs: Date.now() - startedAt,
      status: "error",
      errorCode: aiError?.code ?? "internal_error",
      errorMessage:
        aiError?.technicalMessage ??
        (error instanceof Error ? error.message : String(error)),
      meta: options.meta,
    });
    throw error;
  }
}

/** JSON şemalı üretimlerde yanıtı doğrudan tipli nesneye çevirir. */
export async function runStructured<T>(
  options: RunChatOptions & { jsonSchema: JsonSchemaSpec },
): Promise<{ data: T; response: ChatResponse }> {
  const response = await runChat(options);
  const parsed = parseLooseJson<T>(response.text);

  if (parsed !== null) return { data: parsed, response };

  throw new AIProviderError(
    "Yapay zekâ yanıtı beklenen biçimde değildi. Lütfen tekrar dene.",
    "anthropic",
    "service_error",
    502,
    `unparseable model output (${response.modelKey}): ${response.text.slice(0, 400)}`,
    true,
  );
}

export async function runEmbedding(options: {
  profile: Profile;
  inputs: string[];
  documentId?: string | null;
  skipQuota?: boolean;
}): Promise<number[][]> {
  const { model, provider } = await selectModel(options.profile, "embedding");
  const startedAt = Date.now();

  try {
    const response = await provider.embed(model.model_key, {
      inputs: options.inputs,
    });
    await recordRequest({
      profile: options.profile,
      model,
      operation: "EMBEDDING",
      documentId: options.documentId,
      usage: response.usage,
      durationMs: Date.now() - startedAt,
      status: "success",
      meta: { count: options.inputs.length },
    });
    return response.vectors;
  } catch (error) {
    const aiError = error instanceof AIProviderError ? error : null;
    await recordRequest({
      profile: options.profile,
      model,
      operation: "EMBEDDING",
      documentId: options.documentId,
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      durationMs: Date.now() - startedAt,
      status: "error",
      errorCode: aiError?.code ?? "internal_error",
      errorMessage: aiError?.technicalMessage ?? String(error),
    });
    throw error;
  }
}
