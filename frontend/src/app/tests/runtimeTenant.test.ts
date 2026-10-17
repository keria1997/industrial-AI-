import { describe, expect, it, vi } from 'vitest';

import {
  resolvePreferredTenantId,
  savePreferredTenantId,
  type AppUser,
} from '../AppRuntimeProvider';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const user: AppUser = {
  account: 'admin',
  name: '系统管理员',
  tenantIds: ['TENANT-SHWS', 'TENANT-HDJG'],
};

describe('runtime tenant preference', () => {
  it('restores the last tenant selected by the current account', () => {
    const storage = new MemoryStorage();
    expect(resolvePreferredTenantId(user, storage)).toBe('TENANT-SHWS');
    expect(savePreferredTenantId(user, 'TENANT-HDJG', storage)).toBe(true);
    expect(resolvePreferredTenantId(user, storage)).toBe('TENANT-HDJG');
  });

  it('rejects a stored or requested tenant outside the signed session', () => {
    const storage = new MemoryStorage();
    const restrictedUser = { ...user, tenantIds: ['TENANT-SHWS'] };
    storage.setItem('industrial-ai-runtime:tenant:v1:admin', 'TENANT-HDJG');
    expect(resolvePreferredTenantId(restrictedUser, storage)).toBe('TENANT-SHWS');
    expect(savePreferredTenantId(restrictedUser, 'TENANT-HDJG', storage)).toBe(false);
  });

  it('keeps login initialization working when the localStorage getter is blocked', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('SecurityError'); } });
    try {
      expect(resolvePreferredTenantId(user)).toBe('TENANT-SHWS');
      expect(savePreferredTenantId(user, 'TENANT-HDJG')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
