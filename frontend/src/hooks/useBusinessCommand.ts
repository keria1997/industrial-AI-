import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';

// A pending/unknown command retains its idempotency key; do not silently generate a second write.
export function useBusinessCommand(scope = '') {
  const busy = useRef(false);
  const keys = useRef(new Map<string, string>());
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    setUncertain(keys.current.has(scope));
  }, [scope]);
  const execute = async <T,>(command: (idempotencyKey: string) => Promise<T>): Promise<T | undefined> => {
    if (busy.current) return;
    busy.current = true;
    setPending(true); setError('');
    if (!keys.current.has(scope)) keys.current.set(scope, crypto.randomUUID());
    try {
      const result = await command(keys.current.get(scope)!);
      keys.current.delete(scope); setUncertain(false);
      return result;
    } catch (cause) {
      const unknown = !(cause instanceof ApiError) || cause.status >= 500 || [408, 429].includes(cause.status);
      if (!unknown) keys.current.delete(scope);
      setUncertain(unknown);
      setError(cause instanceof Error ? cause.message : '提交失败，请重试');
    } finally { busy.current = false; setPending(false); }
  };
  return { execute, pending, uncertain, error };
}
