import { useEffect, useRef, useState } from 'react';
import { ApiError, apiContextScope, type ApiContext } from '../api/client';

export const businessCommandScope = (context: ApiContext | null, aggregateId: string, action: string) =>
  JSON.stringify([apiContextScope(context), aggregateId, action]);

type Attempt = { key: string; command: (key: string) => Promise<unknown>; busy: boolean };
type Status = { scope: string; pending: boolean; uncertain: boolean; error: string; apiError?: ApiError };

// Unknown outcomes reuse the original closure (body/version) and key, not the latest edited props.
export function useBusinessCommand(scope = '') {
  const attempts = useRef(new Map<string, Attempt>());
  const identity = useRef(scope);
  identity.current = scope;
  const active = useRef(true);
  const [status, setStatus] = useState<Status>({ scope, pending: false, uncertain: false, error: '' });
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    const attempt = attempts.current.get(scope);
    setStatus({ scope, pending: Boolean(attempt?.busy), uncertain: Boolean(attempt), error: '' });
  }, [scope]);
  const execute = async <T,>(command: (idempotencyKey: string) => Promise<T>): Promise<T | undefined> => {
    if (identity.current !== scope || !active.current) return;
    let attempt = attempts.current.get(scope);
    if (attempt?.busy) return;
    if (!attempt) {
      attempt = { key: crypto.randomUUID(), command, busy: false };
      attempts.current.set(scope, attempt);
    }
    attempt.busy = true;
    const current = () => active.current && identity.current === scope;
    setStatus({ scope, pending: true, uncertain: true, error: '' });
    try {
      const result = await attempt.command(attempt.key);
      attempts.current.delete(scope);
      if (!current()) return;
      setStatus({ scope, pending: false, uncertain: false, error: '' });
      return result as T;
    } catch (cause) {
      const unknown = !(cause instanceof ApiError) || cause.status >= 500 || [408, 429].includes(cause.status);
      if (!unknown) attempts.current.delete(scope);
      if (current()) setStatus({
        scope, pending: false, uncertain: unknown,
        error: cause instanceof Error ? cause.message : '提交失败，请重试',
        apiError: cause instanceof ApiError ? cause : undefined,
      });
    } finally { attempt.busy = false; }
  };
  const retry = async <T,>(): Promise<T | undefined> => {
    const attempt = attempts.current.get(scope);
    return attempt ? execute<T>(attempt.command as (key: string) => Promise<T>) : undefined;
  };
  const visible = status.scope === scope ? status : { pending: false, uncertain: false, error: '', apiError: undefined };
  return { execute, retry, pending: visible.pending, uncertain: visible.uncertain, error: visible.error, apiError: visible.apiError };
}
