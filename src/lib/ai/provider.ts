import type { AIProviderName } from "@/lib/types";

/** Modele gönderilen içerik parçaları — sağlayıcıdan bağımsız. */
export type AIContentPart =
  | { kind: "text"; text: string }
  | { kind: "image"; mediaType: string; dataBase64: string }
  | { kind: "pdf"; dataBase64: string };

export interface AIMessage {
  role: "user" | "assistant";
  content: string | AIContentPart[];
}

export interface JsonSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
}

export interface ChatRequest {
  system?: string;
  messages: AIMessage[];
  maxOutputTokens: number;
  /** Verilirse model yalnızca bu şemaya uyan JSON döndürür. */
  jsonSchema?: JsonSchemaSpec;
  /** Düşünme derinliği / maliyet dengesi. */
  effort?: "low" | "medium" | "high";
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export interface ChatResponse {
  text: string;
  usage: TokenUsage;
  modelKey: string;
  stopReason: string | null;
}

export interface EmbeddingRequest {
  inputs: string[];
}

export interface EmbeddingResponse {
  vectors: number[][];
  usage: TokenUsage;
  modelKey: string;
}

export interface ProviderCapabilities {
  vision: boolean;
  pdf: boolean;
  embedding: boolean;
  jsonSchema: boolean;
}

/**
 * Tüm sağlayıcılar bu arayüzü uygular. Uygulamanın hiçbir yeri
 * doğrudan bir sağlayıcı SDK'sını çağırmaz — yalnızca AIService üzerinden geçer.
 */
export interface AIProvider {
  readonly name: AIProviderName;
  readonly capabilities: ProviderCapabilities;

  chat(modelKey: string, request: ChatRequest): Promise<ChatResponse>;
  embed(modelKey: string, request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
