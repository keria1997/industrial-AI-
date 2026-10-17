import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  defaultRole,
  findModuleByLabel,
  isRoleName,
  type ModuleLabel,
  type RoleName,
} from './moduleRegistry';
import { createModuleUrl, resolveModuleFromLocation } from './routing';
import { clearAuthenticatedSession, loadAuthenticatedSession, saveAuthenticatedSession, type AuthenticatedUser } from '../api/session';
import { apiRequest } from '../api/client';

export type AppUser = {
  account?: string;
  loginAt?: string;
  loginType?: string;
  accessToken?: string;
  expiresAt?: string;
  tenantIds?: string[];
  name: string;
  permissionSource?: string;
  permissions?: string[];
  role?: string;
  [key: string]: unknown;
};

export type TenantOption = {
  id: string;
  name: string;
  code: string;
  plan: string;
  scope: string;
};

const tenantPreferenceKey = (account?: string) =>
  `industrial-ai-runtime:tenant:v1:${account || 'anonymous'}`;

const allowedTenantIds = (user: AppUser | null) => {
  return [...new Set(user?.tenantIds?.filter(Boolean) ?? [])];
};

export const resolvePreferredTenantId = (
  user: AppUser | null,
  storage?: Pick<Storage, 'getItem'>,
) => {
  const allowed = allowedTenantIds(user);
  try {
    const stored = (storage || window.localStorage).getItem(tenantPreferenceKey(user?.account));
    if (stored && allowed.includes(stored)) return stored;
  } catch {
    // Fall back to the first tenant authorized by the current session.
  }
  return allowed[0] || '';
};

export const savePreferredTenantId = (
  user: AppUser | null,
  tenantId: string,
  storage?: Pick<Storage, 'setItem'>,
) => {
  if (!allowedTenantIds(user).includes(tenantId)) return false;
  try {
    (storage || window.localStorage).setItem(tenantPreferenceKey(user?.account), tenantId);
    return true;
  } catch {
    return false;
  }
};

const loadSession = (): AppUser | null => {
  return loadAuthenticatedSession();
};

export const resolveSessionRole = (user: AppUser | null): RoleName =>
  user?.role === '管理员' || user?.role === '系统管理员' ? '超级管理员' :
    isRoleName(user?.role) ? user.role : defaultRole;

type NavigateOptions = {
  replace?: boolean;
  query?: Record<string, string | null | undefined>;
};

type AppRuntimeContextValue = {
  activeModule: ModuleLabel;
  moduleNavigationRevision: number;
  activeRole: RoleName;
  allTenantOptions: readonly TenantOption[];
  currentTenant: TenantOption;
  currentTenantId: string;
  currentUser: AppUser | null;
  navigateModule: (module: string, options?: NavigateOptions) => void;
  setActiveRole: Dispatch<SetStateAction<RoleName>>;
  setCurrentTenantId: Dispatch<SetStateAction<string>>;
  setCurrentUser: Dispatch<SetStateAction<AppUser | null>>;
  permissionsReady: boolean;
  permissionError: string;
  permissionRefreshing: boolean;
  refreshPermissions: () => Promise<void>;
};

const AppRuntimeContext = createContext<AppRuntimeContextValue | null>(null);

export const AppRuntimeProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(loadSession);
  const [activeModule, setActiveModule] = useState<ModuleLabel>(() => resolveModuleFromLocation(window.location));
  const [moduleNavigationRevision, setModuleNavigationRevision] = useState(0);
  const [currentTenantId, setCurrentTenantId] = useState(() => resolvePreferredTenantId(currentUser));
  const [activeRole, setActiveRole] = useState<RoleName>(() => resolveSessionRole(currentUser));
  const scope = `${currentTenantId}:${currentUser?.accessToken || ''}`;
  const [permissionScope, setPermissionScope] = useState(scope);
  const [permissionError, setPermissionError] = useState('');
  const [permissionRefreshing, setPermissionRefreshing] = useState(false);
  const requestGeneration = useRef(0);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const refreshPermissions = useCallback(async () => {
    if (!currentUser?.accessToken || !currentTenantId) return;
    const generation = ++requestGeneration.current;
    const requestedScope = scope;
    setPermissionRefreshing(true); setPermissionError('');
    try {
      const result = await apiRequest<{ permissions: string[]; permissionVersion?: string }>(
        '/api/v1/production/readiness',
        { tenantId: currentTenantId, accessToken: currentUser.accessToken },
      );
      if (generation !== requestGeneration.current || requestedScope !== scopeRef.current) return;
      if (!Array.isArray(result.permissions) || result.permissions.some(code => typeof code !== 'string')) throw new Error('未取得有效权限集合');
      setCurrentUser(previous => {
        if (!previous || previous.accessToken !== currentUser.accessToken) return previous;
        const unchanged = previous.permissions?.length === result.permissions.length
          && previous.permissions.every(code => result.permissions.includes(code));
        const updated = { ...previous, permissions: unchanged ? previous.permissions : result.permissions, ...(result.permissionVersion ? { permissionVersion: result.permissionVersion } : {}) };
        saveAuthenticatedSession(updated as AuthenticatedUser);
        return updated;
      });
      setPermissionScope(requestedScope);
    } catch (cause) {
      if (generation === requestGeneration.current && requestedScope === scopeRef.current) {
        setPermissionScope('');
        setPermissionError(cause instanceof Error ? cause.message : '权限读取失败');
      }
    } finally {
      if (generation === requestGeneration.current && requestedScope === scopeRef.current) setPermissionRefreshing(false);
    }
  }, [scope, currentUser?.accessToken, currentTenantId]);

  useEffect(() => {
    if (scope !== permissionScope && currentUser?.accessToken) void refreshPermissions();
  }, [scope]);

  useEffect(() => {
    const invalidate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && (detail.tenantId !== currentTenantId || detail.accessToken !== currentUser?.accessToken)) return;
      void refreshPermissions();
    };
    window.addEventListener('industrial-ai-permissions-invalid', invalidate);
    window.addEventListener('industrial-ai-permissions-changed', invalidate);
    return () => {
      window.removeEventListener('industrial-ai-permissions-invalid', invalidate);
      window.removeEventListener('industrial-ai-permissions-changed', invalidate);
    };
  }, [refreshPermissions]);

  const allTenantOptions = useMemo(() => allowedTenantIds(currentUser).map((id, index) => ({
    id, name: index === 0 && currentUser?.tenantName ? String(currentUser.tenantName) : id,
    code: id, plan: '尚未获取套餐', scope: '以服务端授权范围为准',
  })), [currentUser?.tenantIds, currentUser?.tenantName]);
  const currentTenant = allTenantOptions.find((item) => item.id === currentTenantId)
    ?? allTenantOptions[0] ?? { id: '', name: '未获取授权租户', code: '', plan: '-', scope: '-' };

  const navigateModule = useCallback((requestedModule: string, options: NavigateOptions = {}) => {
    const module = findModuleByLabel(requestedModule) ?? findModuleByLabel('工作台')!;
    let nextUrl = createModuleUrl(window.location, module.label);
    if (options.query) {
      const parsedUrl = new URL(nextUrl, window.location.origin);
      Object.entries(options.query).forEach(([key, value]) => {
        if (value == null || value === '') parsedUrl.searchParams.delete(key);
        else parsedUrl.searchParams.set(key, value);
      });
      nextUrl = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    }
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history[options.replace ? 'replaceState' : 'pushState']({}, '', nextUrl);
    }
    setActiveModule(module.label);
    // Re-enter even when the module and URL are unchanged but a local tab is active.
    setModuleNavigationRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setActiveModule(resolveModuleFromLocation(window.location));
      setModuleNavigationRevision((revision) => revision + 1);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const expireSession = () => {
      clearAuthenticatedSession();
      setCurrentUser(null);
    };
    window.addEventListener('industrial-ai-session-expired', expireSession);
    return () => window.removeEventListener('industrial-ai-session-expired', expireSession);
  }, []);

  useEffect(() => {
    setActiveRole(resolveSessionRole(currentUser));
  }, [currentUser?.role]);

  useEffect(() => {
    setCurrentTenantId(resolvePreferredTenantId(currentUser));
  }, [currentUser?.account, currentUser?.tenantIds]);

  useEffect(() => {
    savePreferredTenantId(currentUser, currentTenantId);
  }, [currentTenantId]);

  const value = useMemo<AppRuntimeContextValue>(() => ({
    activeModule,
    moduleNavigationRevision,
    activeRole,
    allTenantOptions,
    currentTenant,
    currentTenantId,
    currentUser,
    navigateModule,
    setActiveRole,
    setCurrentTenantId,
    setCurrentUser,
    permissionsReady: permissionScope === scope,
    permissionError,
    permissionRefreshing,
    refreshPermissions,
  }), [activeModule, moduleNavigationRevision, activeRole, currentTenant, currentTenantId, currentUser, navigateModule, permissionScope, scope, permissionError, permissionRefreshing, refreshPermissions]);

  return <AppRuntimeContext.Provider value={value}>{children}</AppRuntimeContext.Provider>;
};

export const useAppRuntime = () => {
  const context = useContext(AppRuntimeContext);
  if (!context) throw new Error('useAppRuntime must be used within AppRuntimeProvider');
  return context;
};
