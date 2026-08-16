import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { AIProviderError, providerError } from "@/lib/ai/errors";
import type {
  AIContentPart,
  AIMessage,
  AIProvider,
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderCapabilities,
} from "@/lib/ai/provider";

/** 16K üstü çıktılarda HTTP zaman aşımını önlemek için stream'e geçilir. */
const STREAM_THRESHOLD = 16_000;

function toBlocks(parts: AIContentPart[]): Anthropic.ContentBlockParam[] {
  return parts.map((part) => {
    switch (part.kind) {
      case "text":
        return { type: "text", text: part.text };
      case "image":
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: part.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: part.dataBase64,
          },
        };
      case "pdf":
        return {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: part.dataBase64,
          },
        };
    }
  });
}

function toMessages(messages: AIMessage[]): Anthropic.MessageParam[] {
  return messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === "string"
        ? message.content
        : toBlocks(message.content),
  }));
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  readonly capabilities: ProviderCapabilities = {
    vision: true,
    pdf: true,
    embedding: false,
    jsonSchema: true,
  };

  private readonly client: Anthropic;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new Anthropic({ apiKey, baseURL, maxRetries: 2 });
  }

  async chat(modelKey: string, request: ChatRequest): Promise<ChatResponse> {
    const buildParams = (withEffort: boolean) => {
      const outputConfig: Record<string, unknown> = {};
      // Bazı modeller (ör. Haiku 4.5) effort parametresini reddediyor.
      if (withEffort && request.effort) outputConfig.effort = request.effort;
      if (request.jsonSchema) {
        outputConfig.format = {
          type: "json_schema",
          schema: request.jsonSchema.schema,
        };
      }

      return {
        model: modelKey,
        max_tokens: request.maxOutputTokens,
        system: request.system,
        messages: toMessages(request.messages),
        // Üretim işleri araç kullanmıyor; düşünmeyi kapatmak maliyeti
        // öngörülebilir kılıyor. Derinlik `effort` ile ayarlanır.
        thinking: { type: "disabled" as const },
        ...(Object.keys(outputConfig).length > 0
          ? { output_config: outputConfig }
          : {}),
      } as unknown as Anthropic.MessageCreateParamsNonStreaming;
    };

    const send = async (withEffort: boolean) => {
      const params = buildParams(withEffort);
      return request.maxOutputTokens > STREAM_THRESHOLD
        ? await this.client.messages
            .stream(params as Anthropic.MessageCreateParams)
            .finalMessage()
        : await this.client.messages.create(params);
    };

    try {
      let message: Anthropic.Message;
      try {
        message = await send(Boolean(request.effort));
      } catch (error) {
        // Katalogdaki yetenek bayrağı yanlışsa tek seferlik kurtarma:
        // effort'suz tekrar dene ki materyal işlenmeden kalmasın.
        const unsupportedEffort =
          error instanceof Anthropic.APIError &&
          error.status === 400 &&
          /effort/i.test(error.message);
        if (!unsupportedEffort || !request.effort) throw error;
        console.warn(
          `[anthropic] ${modelKey} effort parametresini desteklemiyor; effort olmadan yeniden denendi.`,
        );
        message = await send(false);
      }

      if (message.stop_reason === "refusal") {
        throw new AIProviderError(
          "Yapay zekâ bu içerik için yanıt üretemedi.",
          this.name,
          "refusal",
          422,
          `refusal: ${JSON.stringify(message.stop_details ?? {})}`,
          false,
        );
      }

      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      return {
        text,
        modelKey,
        stopReason: message.stop_reason,
        usage: {
          inputTokens:
            message.usage.input_tokens +
            (message.usage.cache_creation_input_tokens ?? 0) +
            (message.usage.cache_read_input_tokens ?? 0),
          outputTokens: message.usage.output_tokens,
          cachedTokens: message.usage.cache_read_input_tokens ?? 0,
        },
      };
    } catch (error) {
      throw this.wrap(error);
    }
  }

  async embed(): Promise<EmbeddingResponse> {
    throw new AIProviderError(
      "Bu sağlayıcı embedding desteklemiyor.",
      this.name,
      "invalid_request",
      400,
      "Anthropic does not provide an embeddings endpoint.",
      false,
    );
  }

  private wrap(error: unknown): AIProviderError {
    if (error instanceof AIProviderError) return error;
    if (error instanceof Anthropic.APIError) {
      return providerError(this.name, error.status ?? 500, `${error.name}: ${error.message}`);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return providerError(this.name, 503, error.message, "timeout");
    }
    return providerError(
      this.name,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export type { EmbeddingRequest };
