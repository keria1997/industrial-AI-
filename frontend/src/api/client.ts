export type ApiContext = {
  tenantId: string;
  accessToken: string;
  permissionVersion?: string;
  scopeVersion?: string;
};

export const apiContextScope = (context: ApiContext | null | undefined): string =>
  context ? JSON.stringify([context.tenantId, context.accessToken, context.permissionVersion, context.scopeVersion]) : '';

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
    ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    ...(options.expectedVersion ? { "If-Match": `"${options.expectedVersion}"` } : {}),
    ...options.headers,
  };
  // Browser -> business backend: canonical key, with an identical legacy header during migration.
  const keys = Object.entries(headers)
    .filter(([name]) => ['idempotency-key', 'x-idempotency-key'].includes(name.toLowerCase()))
    .map(([, value]) => value).concat(options.idempotencyKey ? [options.idempotencyKey] : []);
  if (new Set(keys).size > 1) throw new ApiError('幂等请求头不一致，未发送请求', 400, 'CLIENT_IDEMPOTENCY_CONFLICT');
  if (keys[0]) {
    headers['Idempotency-Key'] = keys[0];
    headers['X-Idempotency-Key'] = keys[0];
  }
  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const value = response.status !== 204 && contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const error = value?.error ?? {};
    if (response.status === 401 && context && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("industrial-ai-session-expired", { detail: context }));
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
