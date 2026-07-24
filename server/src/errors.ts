export type ProductionErrorCode =
  | "PRODUCTION_400_INVALID_ARGUMENT"
  | "PRODUCTION_401_UNAUTHENTICATED"
  | "PRODUCTION_403_PERMISSION_DENIED"
  | "PRODUCTION_403_CAPABILITY_DISABLED"
  | "PRODUCTION_404_NOT_FOUND"
  | "PRODUCTION_409_VERSION_CONFLICT"
  | "PRODUCTION_409_ILLEGAL_STATE"
  | "PRODUCTION_409_IDEMPOTENCY_CONFLICT"
  | "PRODUCTION_422_MASTER_DATA_MISSING"
  | "PRODUCTION_422_KITTING_BLOCKED"
  | "PRODUCTION_422_QUANTITY_VIOLATION"
  | "PRODUCTION_423_RESOURCE_LOCKED"
  | "PRODUCTION_424_DEPENDENCY_FAILED"
  | "PRODUCTION_429_TASK_RUNNING"
  | "PRODUCTION_503_PLATFORM_UNAVAILABLE";

const STATUS_BY_CODE: Record<ProductionErrorCode, number> = {
  PRODUCTION_400_INVALID_ARGUMENT: 400,
  PRODUCTION_401_UNAUTHENTICATED: 401,
  PRODUCTION_403_PERMISSION_DENIED: 403,
  PRODUCTION_403_CAPABILITY_DISABLED: 403,
  PRODUCTION_404_NOT_FOUND: 404,
  PRODUCTION_409_VERSION_CONFLICT: 409,
  PRODUCTION_409_ILLEGAL_STATE: 409,
  PRODUCTION_409_IDEMPOTENCY_CONFLICT: 409,
  PRODUCTION_422_MASTER_DATA_MISSING: 422,
  PRODUCTION_422_KITTING_BLOCKED: 422,
  PRODUCTION_422_QUANTITY_VIOLATION: 422,
  PRODUCTION_423_RESOURCE_LOCKED: 423,
  PRODUCTION_424_DEPENDENCY_FAILED: 424,
  PRODUCTION_429_TASK_RUNNING: 429,
  PRODUCTION_503_PLATFORM_UNAVAILABLE: 503,
};

export interface FieldError {
  field: string;
  message: string;
}

export class ProductionError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: ProductionErrorCode,
    message: string,
    readonly suggestion: string,
    readonly options: { retryable?: boolean; fieldErrors?: FieldError[]; details?: unknown } = {},
  ) {
    super(message);
    this.name = "ProductionError";
    this.statusCode = STATUS_BY_CODE[code];
  }
}

export function errorBody(error: ProductionError, traceId: string) {
  return {
    error: {
      code: error.code,
      message: error.message,
      suggestion: error.suggestion,
      retryable: error.options.retryable ?? false,
      fieldErrors: error.options.fieldErrors ?? [],
      details: error.options.details,
      traceId,
    },
  };
}

