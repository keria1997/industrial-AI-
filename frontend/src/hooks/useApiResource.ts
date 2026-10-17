import { useCallback, useEffect, useState } from 'react';
import { apiContextScope, type ApiContext } from '../api/client';

export type ApiResource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

// Scope every read to the tenant/token; late responses cannot restore the previous tenant's facts.
export function useApiResource<T>(
  context: ApiContext | null,
  load: (context: ApiContext) => Promise<T>,
): ApiResource<T> {
  const scope = apiContextScope(context);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    scope: string; loader?: typeof load; revision?: number; data: T | null; loading: boolean; error: string | null;
  }>({ scope: '', data: null, loading: true, error: null });
  const reload = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    const identity = { scope, loader: load, revision };
    setResult({ ...identity, data: null, loading: Boolean(context), error: context ? null : '请登录后加载数据' });
    if (context) {
      Promise.resolve().then(() => load(context)).then(
        data => { if (!cancelled) setResult({ ...identity, data, loading: false, error: null }); },
        error => {
          if (!cancelled) setResult({
            ...identity, data: null, loading: false,
            error: error instanceof Error ? error.message : '数据加载失败',
          });
        },
      );
    }
    return () => { cancelled = true; };
  }, [scope, load, revision]);

  return {
    ...(result.scope === scope && result.loader === load && result.revision === revision ? result : { data: null, loading: Boolean(context), error: null }),
    reload,
  };
}
