import { describe, expect, it } from 'vitest';
import {
  clearPrototypeBusinessData,
  installPrototypeStoragePolicy,
  isPrototypeBusinessKey,
} from './prototypeStorage';

const retiredKeys = [
  'industrial-ai-sales:v1:TENANT-A',
  'industrial-ai-sales:v8:TENANT-B',
  'industrial-ai-sales:v99:TENANT-C',
  'industrial-ai-inventory-master:v1:TENANT-A',
  'industrial-ai-inventory-master-data:v1:TENANT-A',
  'industrial-ai-inventory-sales-outbound:v1:TENANT-B',
  'industrial-ai-inventory-workflow:v2:TENANT-C',
  'industrial-ai-production-legacy:TENANT-A',
  'industrial-ai-production-v2:TENANT-B',
  'industrial-ai-production-v99:TENANT-C',
  'industrial-ai-platform-v2:TENANT-A',
];
const retainedKeys = [
  'industrial-ai-session:v2',
  'industrial-ai-runtime:tenant:v1:account',
  'industrial-ai:outbound-command:v1:TENANT-A:OUT-1:3',
  'industrial-ai-production-live-completions:v1:TENANT-A',
  'industrial-ai-production-planning-tasks:v1:TENANT-A',
  'unrelated-application',
];

const createStorage = () => {
  class MemoryStorage {
    private values = new Map<string, string>();
    get length() { return this.values.size; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { this.values.set(key, value); }
    removeItem(key: string) { this.values.delete(key); }
    clear() { this.values.clear(); }
  }
  return { storage: new MemoryStorage() as Storage, prototype: MemoryStorage.prototype };
};

describe('retired prototype storage', () => {
  it('clears historical versions and all tenants in both storage areas on every startup', () => {
    const localStorage = createStorage().storage;
    const sessionStorage = createStorage().storage;
    for (const storage of [localStorage, sessionStorage]) {
      [...retiredKeys, ...retainedKeys].forEach(key => storage.setItem(key, key));
    }
    clearPrototypeBusinessData({ localStorage, sessionStorage });
    clearPrototypeBusinessData({ localStorage, sessionStorage });
    for (const storage of [localStorage, sessionStorage]) {
      retiredKeys.forEach(key => expect(storage.getItem(key)).toBeNull());
      retainedKeys.forEach(key => expect(storage.getItem(key)).toBe(key));
    }
  });

  it('prevents old readers and writers from restoring business snapshots', () => {
    const { storage, prototype } = createStorage();
    retiredKeys.forEach(key => storage.setItem(key, 'stale'));
    installPrototypeStoragePolicy(prototype);
    retiredKeys.forEach(key => {
      expect(storage.getItem(key)).toBeNull();
      expect(() => storage.setItem(key, 'new')).toThrow('请通过业务接口保存');
      expect(() => storage.removeItem(key)).not.toThrow();
    });
    retainedKeys.forEach(key => {
      storage.setItem(key, 'retained');
      expect(storage.getItem(key)).toBe('retained');
      expect(isPrototypeBusinessKey(key)).toBe(false);
    });
  });

  it('still clears session prototypes when local storage is disabled', () => {
    const sessionStorage = createStorage().storage;
    sessionStorage.setItem(retiredKeys[0], 'stale');
    const host = {
      get localStorage(): Storage { throw new Error('SecurityError'); },
      sessionStorage,
    };
    expect(() => clearPrototypeBusinessData(host)).not.toThrow();
    expect(sessionStorage.length).toBe(0);
  });
});
