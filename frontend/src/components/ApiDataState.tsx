import { RefreshCw } from 'lucide-react';

type Props = { loading?: boolean; error?: string | null; onRetry?: () => void; empty?: string };

export function ApiDataState({ loading, error, onRetry, empty = '暂无数据' }: Props) {
  return (
    <div role={error ? 'alert' : 'status'} className={`flex min-h-24 items-center justify-center gap-3 p-4 text-[13px] ${error ? 'text-rose-600' : 'text-slate-500'}`}>
      <span>{loading ? '正在加载数据...' : error ? `加载失败：${error}` : empty}</span>
      {error && onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-current px-2 py-1">
          <RefreshCw size={14} /> 重试
        </button>
      )}
    </div>
  );
}
