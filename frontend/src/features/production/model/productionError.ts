import { ApiError } from '../../../api/client';

/** Preserve backend recovery guidance and trace IDs in persistent production errors. */
export function productionError(cause: unknown): string {
  if (!(cause instanceof Error)) return '请求失败，请重试';
  if (!(cause instanceof ApiError)) return cause.message;
  return [
    cause.message,
    ...cause.fieldErrors.map(field => `${field.field}：${field.message}`),
    cause.suggestion,
    cause.traceId ? `追踪号：${cause.traceId}` : '',
  ].filter(Boolean).join('；');
}
