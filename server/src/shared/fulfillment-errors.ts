export type FulfillmentErrorCode =
  | "FULFILLMENT_400_INVALID_ARGUMENT"
  | "FULFILLMENT_403_PERMISSION_DENIED"
  | "FULFILLMENT_404_NOT_FOUND"
  | "FULFILLMENT_409_VERSION_CONFLICT"
  | "FULFILLMENT_409_ILLEGAL_STATE"
  | "FULFILLMENT_409_IDEMPOTENCY_CONFLICT"
  | "FULFILLMENT_422_QUANTITY_VIOLATION"
  | "FULFILLMENT_424_DEPENDENCY_FAILED";

const statusByCode: Record<FulfillmentErrorCode, number> = {
  FULFILLMENT_400_INVALID_ARGUMENT: 400,
  FULFILLMENT_403_PERMISSION_DENIED: 403,
  FULFILLMENT_404_NOT_FOUND: 404,
  FULFILLMENT_409_VERSION_CONFLICT: 409,
  FULFILLMENT_409_ILLEGAL_STATE: 409,
  FULFILLMENT_409_IDEMPOTENCY_CONFLICT: 409,
  FULFILLMENT_422_QUANTITY_VIOLATION: 422,
  FULFILLMENT_424_DEPENDENCY_FAILED: 424,
};

export class FulfillmentError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: FulfillmentErrorCode,
    message: string,
    readonly suggestion: string,
    readonly options: { retryable?: boolean; details?: unknown } = {},
  ) {
    super(message);
    this.name = "FulfillmentError";
    this.statusCode = statusByCode[code];
  }
}

export const fulfillmentErrorBody = (error: FulfillmentError, traceId: string) => ({
  error: {
    code: error.code,
    message: error.message,
    suggestion: error.suggestion,
    retryable: error.options.retryable ?? false,
    fieldErrors: [],
    details: error.options.details,
    traceId,
  },
});
