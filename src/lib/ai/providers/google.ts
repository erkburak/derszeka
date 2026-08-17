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

/** document_embeddings.embedding kolonunun boyutu. */
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Gemini `responseSchema` alanında tam JSON Schema değil, OpenAPI 3.0'ın bir
 * alt kümesini kabul ediyor: `additionalProperties` gibi anahtarlar isteği
 * 400 ile reddettiriyor ve tip adları büyük harf enum olarak bekleniyor.
 * Bu dönüştürücü, uygulamanın tek bir şema tanımıyla çalışmasını sağlıyor.
 */
const GEMINI_TYPES: Record<string, string> = {
  string: "STRING",
  number: "NUMBER",
  integer: "INTEGER",
  boolean: "BOOLEAN",
  array: "ARRAY",
  object: "OBJECT",
};

type SchemaNode = Record<string, unknown>;

function toGeminiSchema(node: SchemaNode): SchemaNode {
  const rawType = node.type;
  const types = Array.isArray(rawType) ? rawType : [rawType];
  const primary = types.find((type) => type !== "null") as string | undefined;

  const result: SchemaNode = {};
  if (primary) result.type = GEMINI_TYPES[primary] ?? "STRING";
  if (types.includes("null")) result.nullable = true;
  if (typeof node.description === "string") result.description = node.description;
  if (Array.isArray(node.enum)) result.enum = node.enum;

  if (node.properties) {
    const properties: SchemaNode = {};
    for (const [key, value] of Object.entries(node.properties as SchemaNode)) {
      properties[key] = toGeminiSchema(value as SchemaNode);
    }
    result.properties = properties;
    if (Array.isArray(node.required)) result.required = node.required;
    // Alan sırasını sabitlemek çıktı kararlılığını artırıyor.
    result.propertyOrdering = Object.keys(properties);
  }

  if (node.items) result.items = toGeminiSchema(node.items as SchemaNode);
  return result;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  embedding?: { values: number[] };
  embeddings?: { values: number[] }[];
}

function toParts(content: string | AIContentPart[]): GeminiPart[] {
  if (typeof content === "string") return [{ text: content }];
  return content.map((part) => {
    if (part.kind === "text") return { text: part.text };
    return {
      inlineData: {
        mimeType: part.kind === "pdf" ? "application/pdf" : part.mediaType,
        data: part.dataBase64,
      },
    };
  });
}

/**
 * Gemini REST entegrasyonu. Sağlayıcı katmanı sayesinde bu dosyayı
 * eklemek/çıkarmak uygulamanın geri kalanını etkilemez.
 */
export class GoogleProvider implements AIProvider {
  readonly name = "google" as const;
  readonly capabilities: ProviderCapabilities = {
    vision: true,
    pdf: true,
    embedding: true,
    jsonSchema: true,
  };

  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl?: string,
  ) {
    this.baseUrl = baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  }

  async chat(modelKey: string, request: ChatRequest): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      contents: request.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: toParts(message.content),
      })),
      generationConfig: {
        maxOutputTokens: request.maxOutputTokens,
        ...(request.jsonSchema
          ? {
              responseMimeType: "application/json",
              responseSchema: toGeminiSchema(
                request.jsonSchema.schema as SchemaNode,
              ),
            }
          : {}),
      },
    };
    if (request.system) {
      body.systemInstruction = { parts: [{ text: request.system }] };
    }

    const data = await this.request<GeminiResponse>(
      `/models/${modelKey}:generateContent`,
      body,
    );

    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("");

    return {
      text,
      modelKey,
      stopReason: candidate?.finishReason ?? null,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        cachedTokens: data.usageMetadata?.cachedContentTokenCount ?? 0,
      },
    };
  }

  async embed(
    modelKey: string,
    request: EmbeddingRequest,
  ): Promise<EmbeddingResponse> {
    // Veritabanındaki vektör kolonu 1536 boyutlu; Gemini çıktı boyutu
    // ayarlanabildiği için şemayı değiştirmeden uyum sağlıyoruz.
    const data = await this.request<GeminiResponse>(
      `/models/${modelKey}:batchEmbedContents`,
      {
        requests: request.inputs.map((input) => ({
          model: `models/${modelKey}`,
          content: { parts: [{ text: input }] },
          outputDimensionality: EMBEDDING_DIMENSIONS,
        })),
      },
    );

    const vectors = (data.embeddings ?? []).map((item) => item.values);
    for (const vector of vectors) {
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new AIProviderError(
          "Embedding modeli beklenen boyutta vektör döndürmedi.",
          this.name,
          "invalid_request",
          500,
          `expected ${EMBEDDING_DIMENSIONS} dims, got ${vector.length} from ${modelKey}`,
          false,
        );
      }
    }

    return {
      vectors,
      modelKey,
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
    };
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw providerError(
        this.name,
        503,
        error instanceof Error ? error.message : String(error),
        "timeout",
      );
    }

    if (!response.ok) {
      throw providerError(
        this.name,
        response.status,
        `${response.status} ${await response.text().catch(() => "")}`.slice(0, 500),
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
