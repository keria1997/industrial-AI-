import { afterEach, describe, expect, it } from 'vitest';
import { installProductionStorageGuard } from './productionStorage';

describe('production storage guard', () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it('allows reads but rejects every local write in production', () => {
    const storage = {
      length: 0,
      key: () => null,
      getItem: (key: string) => `value:${key}`,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    } as Storage;
    restore = installProductionStorageGuard(storage, true);
    expect(storage.getItem('formal-data')).toBe('value:formal-data');
    expect(() => storage.setItem('local-data', '1')).toThrow('当前功能未开放生产写入');
    expect(() => storage.removeItem('local-data')).toThrow('当前功能未开放生产写入');
    expect(() => storage.removeItem('industrial-ai-session')).not.toThrow();
    expect(() => storage.clear()).toThrow('当前功能未开放生产写入');
  });

  it('keeps development behavior writable and restores methods after uninstall', () => {
    let saved = '';
    const writable = {
      length: 0,
      key: () => null,
      getItem: () => '',
      setItem: (_key: string, value: string) => { saved = value; },
      removeItem: () => undefined,
      clear: () => undefined,
    } as Storage;
    restore = installProductionStorageGuard(writable, false);
    expect(() => writable.setItem('local-data', 'ok')).not.toThrow();
    expect(saved).toBe('ok');
  });
});
