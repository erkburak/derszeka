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
              responseSchema: request.jsonSchema.schema,
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
    const data = await this.request<GeminiResponse>(
      `/models/${modelKey}:batchEmbedContents`,
      {
        requests: request.inputs.map((input) => ({
          model: `models/${modelKey}`,
          content: { parts: [{ text: input }] },
        })),
      },
    );

    return {
      vectors: (data.embeddings ?? []).map((item) => item.values),
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
