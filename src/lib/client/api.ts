/** İstemci tarafı API yardımcıları. Sunucu hatalarını tek tip nesneye çevirir. */

export interface UpgradeInfo {
  limitKey: string;
  limit: number;
  current: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly upgrade?: UpgradeInfo,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  input: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};

  const response = await fetch(input, {
    ...rest,
    ...(json !== undefined
      ? {
          method: rest.method ?? "POST",
          headers: { "content-type": "application/json", ...(rest.headers ?? {}) },
          body: JSON.stringify(json),
        }
      : {}),
  });

  const body = await parse(response);

  if (!response.ok) {
    throw new ApiError(
      (body?.error as string) ??
        "Beklenmeyen bir hata oluştu. Lütfen tekrar dene.",
      (body?.code as string) ?? "unknown",
      response.status,
      body?.upgrade as UpgradeInfo | undefined,
    );
  }

  return (body ?? {}) as T;
}
