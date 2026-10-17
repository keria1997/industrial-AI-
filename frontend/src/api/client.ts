export type ApiContext = {
  tenantId: string;
  accessToken: string;
};

export type ApiFieldError = { field: string; message: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly suggestion?: string,
    readonly retryable = false,
    readonly traceId?: string,
    readonly fieldErrors: ApiFieldError[] = [],
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiRequestOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
  idempotencyKey?: string;
  expectedVersion?: number;
};

export async function apiRequest<T>(path: string, context: ApiContext | null, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(context ? { Authorization: `Bearer ${context.accessToken}`, "X-Tenant-Id": context.tenantId } : {}),
    ...(options.idempotencyKey ? { "X-Idempotency-Key": options.idempotencyKey } : {}),
    ...(options.expectedVersion ? { "If-Match": `"${options.expectedVersion}"` } : {}),
    ...options.headers,
  };
  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const value = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const error = value?.error ?? {};
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("industrial-ai-session-expired"));
    }
    if (response.status === 403 && context && typeof window !== "undefined" && !path.startsWith('/api/v1/production/readiness')) {
      window.dispatchEvent(new CustomEvent("industrial-ai-permissions-invalid", { detail: context }));
    }
    throw new ApiError(
      error.message ?? `请求失败 (${response.status})`,
      response.status,
      error.code ?? "API_ERROR",
      error.suggestion,
      Boolean(error.retryable),
      error.traceId ?? response.headers.get("X-Trace-Id") ?? undefined,
      Array.isArray(error.fieldErrors) ? error.fieldErrors : [],
      error.details,
    );
  }
  return value as T;
}
