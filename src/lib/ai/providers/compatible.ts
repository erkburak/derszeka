import "server-only";

import { AIProviderError, providerError } from "@/lib/ai/errors";
import type {
  AIContentPart,
  AIProvider,
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderCapabilities,
} from "@/lib/ai/provider";

/**
 * OpenAI-uyumlu API konuşan her servis için tek sağlayıcı:
 * Ollama, Groq, OpenRouter, Together, DeepInfra, vLLM, LM Studio, LocalAI...
 *
 * Resmî OpenAI SDK'sı yerine düz `fetch` kullanılıyor; bu servislerin
 * çoğu OpenAI şemasının yalnızca bir alt kümesini uyguluyor ve SDK'nın
 * gönderdiği ek alanlar bazılarında hata veriyor. İstek gövdesini elde
 * tutmak uyumluluğu belirgin şekilde artırıyor.
 */
export class CompatibleProvider implements AIProvider {
  readonly name = "compatible" as const;
  readonly capabilities: ProviderCapabilities = {
    vision: false,
    pdf: false,
    embedding: true,
    // Şema desteği modele göre değişir; model kataloğundaki bayrak belirler.
    jsonSchema: false,
  };

  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl?: string,
  ) {
    // Ollama varsayılanı; Groq/OpenRouter için admin panelinden değiştirilir.
    this.baseUrl = (baseUrl ?? "http://localhost:11434/v1").replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    // Ollama anahtar istemez; "local" gibi bir yer tutucu gönderilebilir.
    if (this.apiKey && this.apiKey !== "local") {
      headers.authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private toContent(content: string | AIContentPart[]): string {
    if (typeof content === "string") return content;
    return content
      .map((part) =>
        part.kind === "text"
          ? part.text
          : "[Bu sağlayıcı görsel/PDF girdisini desteklemiyor.]",
      )
      .join("\n\n");
  }

  async chat(modelKey: string, request: ChatRequest): Promise<ChatResponse> {
    const messages: { role: string; content: string }[] = [];
    if (request.system) messages.push({ role: "system", content: request.system });
    for (const message of request.messages) {
      messages.push({ role: message.role, content: this.toContent(message.content) });
    }

    const body: Record<string, unknown> = {
      model: modelKey,
      messages,
      max_tokens: request.maxOutputTokens,
      stream: false,
    };

    // Şema desteği olanlarda API'ye bırakılır; olmayanlarda servis katmanı
    // şemayı zaten prompt'a gömdüğü için burada yalnızca JSON modu istenir.
    if (request.jsonSchema) {
      body.response_format = request.jsonSchemaNative
        ? {
            type: "json_schema",
            json_schema: {
              name: request.jsonSchema.name,
              strict: true,
              schema: request.jsonSchema.schema,
            },
          }
        : { type: "json_object" };
    }

    const data = await this.request<{
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    }>("/chat/completions", body);

    const choice = data.choices?.[0];
    return {
      text: choice?.message?.content ?? "",
      modelKey,
      stopReason: choice?.finish_reason ?? null,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      },
    };
  }

  async embed(
    modelKey: string,
    request: EmbeddingRequest,
  ): Promise<EmbeddingResponse> {
    const data = await this.request<{
      data?: { embedding: number[] }[];
      usage?: { prompt_tokens?: number };
    }>("/embeddings", { model: modelKey, input: request.inputs });

    return {
      vectors: (data.data ?? []).map((item) => item.embedding),
      modelKey,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: 0,
        cachedTokens: 0,
      },
    };
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        // Yerel modeller yavaş olabilir; kopmadan beklemeye izin ver.
        signal: AbortSignal.timeout(10 * 60_000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AIProviderError(
        this.baseUrl.includes("localhost")
          ? "Yerel yapay zekâ sunucusuna ulaşılamadı. Ollama çalışıyor mu?"
          : "Yapay zekâ sunucusuna ulaşılamadı.",
        this.name,
        "timeout",
        503,
        `${this.baseUrl}${path}: ${message}`,
        true,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw providerError(
        this.name,
        response.status,
        `${this.baseUrl}${path} → ${response.status} ${detail.slice(0, 400)}`,
      );
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new AIProviderError(
        "Yapay zekâ yanıtı okunamadı.",
        this.name,
        "service_error",
        502,
        error instanceof Error ? error.message : String(error),
        true,
      );
    }
  }
}
