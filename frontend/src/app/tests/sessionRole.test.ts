import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadAuthenticatedSession,
  loginWithPassword,
  loginWithSms,
  refreshSession,
  saveAuthenticatedSession,
} from '../../api/session';

describe('account role throughout authentication', () => {
  const user = {
    account: 'role-test', name: '角色验证', role: '销售', tenantIds: ['tenant-1'],
    permissions: ['workbench.dashboard.read'], permissionVersion: 'v1',
  };
  let stored: Map<string, string>;

  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
      },
      localStorage: { removeItem: vi.fn() },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const authenticate = {
    password: () => loginWithPassword({ account: user.account, password: 'test-only', captchaId: 'challenge', captchaCode: '1234' }),
    sms: () => loginWithSms('13800000000', '123456'),
    refresh: () => refreshSession({ accessToken: 'old-test-token' }),
  };

  for (const [method, request] of Object.entries(authenticate)) {
    it.each(['超级管理员', '自定义角色', '']) (`${method} preserves the backend role %j`, async role => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        accessToken: 'new-test-token', expiresAt: '2099-01-01T00:00:00Z', tokenType: 'Bearer',
        user: { ...user, role },
      }), { headers: { 'Content-Type': 'application/json' } }));
      vi.stubGlobal('fetch', fetchMock);
      const session = await request();
      expect(session.role).toBe(role);
      saveAuthenticatedSession(session);
      expect(loadAuthenticatedSession()).toEqual(session);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(stored.has('industrial-ai-session:v2')).toBe(true);
    });
  }

  it('replaces the former account role from a refreshed signed session', async () => {
    saveAuthenticatedSession({
      ...user, role: '原角色', accessToken: 'old-test-token', expiresAt: '2099-01-01T00:00:00Z',
      loginAt: new Date().toISOString(), loginType: 'account', permissionSource: 'test',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accessToken: 'new-test-token', expiresAt: '2099-01-01T00:00:00Z', tokenType: 'Bearer', user,
    }), { headers: { 'Content-Type': 'application/json' } })));
    saveAuthenticatedSession(await refreshSession({ accessToken: 'old-test-token' }));
    expect(loadAuthenticatedSession()?.role).toBe('销售');
  });
});
