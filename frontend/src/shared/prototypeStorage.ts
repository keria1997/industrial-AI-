// Retired business snapshots must never override facts returned by the backend.
export const isPrototypeBusinessKey = (key: string): boolean =>
  /^industrial-ai-(?:sales(?=[:_-]|$)|inventory(?=[:_-]|$)|production-(?:legacy(?=[:_-]|$)|v\d+(?=:|$))|platform(?:-v\d+)?(?=:|$))/.test(key);

type StorageHost = Pick<Window, 'localStorage' | 'sessionStorage'>;

export function clearPrototypeBusinessData(host: StorageHost): void {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = host[name];
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
      keys.forEach((key) => {
        if (key && isPrototypeBusinessKey(key)) storage.removeItem(key);
      });
    } catch {
      // Storage can be disabled independently of API access.
    }
  }
}

export function installPrototypeStoragePolicy(prototype: Pick<Storage, 'getItem' | 'setItem'>): void {
  const getItem = prototype.getItem;
  const setItem = prototype.setItem;
  Object.defineProperties(prototype, {
    getItem: {
      configurable: true,
      writable: true,
      value(this: Storage, key: string) {
        return isPrototypeBusinessKey(String(key)) ? null : getItem.call(this, key);
      },
    },
    setItem: {
      configurable: true,
      writable: true,
      value(this: Storage, key: string, value: string) {
        if (isPrototypeBusinessKey(String(key))) {
          throw new Error('未保存：浏览器原型业务存储已停用，请通过业务接口保存');
        }
        return setItem.call(this, key, value);
      },
    },
  });
}
