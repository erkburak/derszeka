import "server-only";

import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { LimitExceededError } from "@/lib/limits";
import { RateLimitError } from "@/lib/security/rate-limit";
import { AIProviderError } from "@/lib/ai/errors";

/** Kullanıcıya gösterilebilir, teknik olmayan hata. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "bad_request",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export interface ApiErrorBody {
  error: string;
  code: string;
  /** Limit aşımında istemci yükseltme ekranı gösterir. */
  upgrade?: { limitKey: string; limit: number; current: number };
}

/**
 * Hataları kullanıcı dostu mesajlara çevirir.
 * Teknik detay yalnızca sunucu loglarına yazılır, yanıta konmaz.
 */
export function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof LimitExceededError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "limit_exceeded",
        upgrade: {
          limitKey: error.limitKey,
          limit: error.limitValue,
          current: error.current,
        },
      },
      { status: 402 },
    );
  }

  if (error instanceof RateLimitError) {
    return NextResponse.json(
      { error: error.message, code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
    );
  }

  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.message, code: "unauthorized" },
      { status: error.status },
    );
  }

  if (error instanceof AIProviderError) {
    console.error("[ai-provider]", error.provider, error.code, error.technicalMessage);
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  console.error("[unhandled]", error);
  return NextResponse.json(
    {
      error:
        "Beklenmeyen bir hata oluştu. Lütfen birkaç dakika sonra tekrar deneyin.",
      code: "internal_error",
    },
    { status: 500 },
  );
}

/** Route handler'ları tek tip hata yönetimiyle sarmalar. */
export function withApi<T extends unknown[]>(
  handler: (request: Request, ...args: T) => Promise<Response>,
) {
  return async (request: Request, ...args: T): Promise<Response> => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AppError("Geçersiz istek gövdesi.", 400, "invalid_body");
  }
}
