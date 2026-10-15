type StorageWriter = (...args: unknown[]) => void;

export function installProductionStorageGuard(storage: Storage, enabled: boolean): () => void {
  const originals = new Map<string, StorageWriter>();
  const methods = ['setItem', 'removeItem', 'clear'] as const;

  if (enabled) {
    methods.forEach((method) => {
      const original = storage[method].bind(storage) as StorageWriter;
      originals.set(method, original);
      Object.defineProperty(storage, method, {
        configurable: true,
        value(...args: unknown[]) {
          if (method === 'removeItem' && args[0] === 'industrial-ai-session') return original(...args);
          throw new Error('当前功能未开放生产写入，请使用已接入正式服务的功能');
        },
      });
    });
  }

  return () => {
    originals.forEach((original, method) => {
      Object.defineProperty(storage, method, {
        configurable: true,
        value: original,
        writable: true,
      });
    });
  };
}
