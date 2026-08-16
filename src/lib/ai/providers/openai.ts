import "server-only";

import OpenAI from "openai";
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

type OpenAIContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

function toContent(parts: AIContentPart[]): OpenAIContent[] {
  return parts.map((part) => {
    switch (part.kind) {
      case "text":
        return { type: "text", text: part.text };
      case "image":
        return {
          type: "image_url",
          image_url: { url: `data:${part.mediaType};base64,${part.dataBase64}` },
        };
      case "pdf":
        return {
          type: "file",
          file: {
            filename: "document.pdf",
            file_data: `data:application/pdf;base64,${part.dataBase64}`,
          },
        };
    }
  });
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  readonly capabilities: ProviderCapabilities = {
    vision: true,
    pdf: true,
    embedding: true,
    jsonSchema: true,
  };

  private readonly client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL, maxRetries: 2 });
  }

  async chat(modelKey: string, request: ChatRequest): Promise<ChatResponse> {
    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (request.system) {
        messages.push({ role: "system", content: request.system });
      }
      for (const message of request.messages) {
        messages.push({
          role: message.role,
          content:
            typeof message.content === "string"
              ? message.content
              : (toContent(message.content) as never),
        } as OpenAI.Chat.ChatCompletionMessageParam);
      }

      const completion = await this.client.chat.completions.create({
        model: modelKey,
        max_completion_tokens: request.maxOutputTokens,
        messages,
        ...(request.jsonSchema
          ? {
              response_format: {
                type: "json_schema" as const,
                json_schema: {
                  name: request.jsonSchema.name,
                  strict: true,
                  schema: request.jsonSchema.schema,
                },
              },
            }
          : {}),
      });

      const choice = completion.choices[0];
      return {
        text: choice?.message?.content ?? "",
        modelKey,
        stopReason: choice?.finish_reason ?? null,
        usage: {
          inputTokens: completion.usage?.prompt_tokens ?? 0,
          outputTokens: completion.usage?.completion_tokens ?? 0,
          cachedTokens:
            completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        },
      };
    } catch (error) {
      throw this.wrap(error);
    }
  }

  async embed(
    modelKey: string,
    request: EmbeddingRequest,
  ): Promise<EmbeddingResponse> {
    try {
      const response = await this.client.embeddings.create({
        model: modelKey,
        input: request.inputs,
      });
      return {
        vectors: response.data.map((item) => item.embedding),
        modelKey,
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: 0,
          cachedTokens: 0,
        },
      };
    } catch (error) {
      throw this.wrap(error);
    }
  }

  private wrap(error: unknown): AIProviderError {
    if (error instanceof AIProviderError) return error;
    if (error instanceof OpenAI.APIError) {
      return providerError(this.name, error.status ?? 500, `${error.name}: ${error.message}`);
    }
    return providerError(
      this.name,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
