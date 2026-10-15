import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { clearAuthenticatedSession, loadAuthenticatedSession } from '../api/session';

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

export const tenantOptions: readonly TenantOption[] = [
  { id: 'TENANT-SHWS', name: '上海万申工业集团', code: 'SHWS', plan: '工业旗舰版', scope: '2 工厂 · 4 仓库' },
  { id: 'TENANT-HDJG', name: '华东精工制造', code: 'HDJG', plan: '工业专业版', scope: '1 工厂 · 2 仓库' },
];

const tenantPreferenceKey = (account?: string) =>
  `industrial-ai-runtime:tenant:v1:${account || 'anonymous'}`;

const allowedTenantIds = (user: AppUser | null) => {
  const authorized = user?.tenantIds?.filter((tenantId) => tenantOptions.some((tenant) => tenant.id === tenantId));
  if (authorized?.length) return authorized;
  if (user?.tenantIds?.length) return user.tenantIds;
  return tenantOptions.map((tenant) => tenant.id);
};

export const resolvePreferredTenantId = (
  user: AppUser | null,
  storage: Pick<Storage, 'getItem'> = window.localStorage,
) => {
  const allowed = allowedTenantIds(user);
  try {
    const stored = storage.getItem(tenantPreferenceKey(user?.account));
    if (stored && allowed.includes(stored)) return stored;
  } catch {
    // Fall back to the first tenant authorized by the current session.
  }
  return allowed[0] || tenantOptions[0].id;
};

export const savePreferredTenantId = (
  user: AppUser | null,
  tenantId: string,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
) => {
  if (!allowedTenantIds(user).includes(tenantId)) return false;
  try {
    storage.setItem(tenantPreferenceKey(user?.account), tenantId);
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
};

const AppRuntimeContext = createContext<AppRuntimeContextValue | null>(null);

export const AppRuntimeProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(loadSession);
  const [activeModule, setActiveModule] = useState<ModuleLabel>(() => resolveModuleFromLocation(window.location));
  const [moduleNavigationRevision, setModuleNavigationRevision] = useState(0);
  const [currentTenantId, setCurrentTenantId] = useState(() => resolvePreferredTenantId(currentUser));
  const [activeRole, setActiveRole] = useState<RoleName>(() => resolveSessionRole(currentUser));

  const sessionTenant: TenantOption | undefined = useMemo(() => {
    const tenantId = currentUser?.tenantIds?.[0];
    if (!tenantId || tenantOptions.some((item) => item.id === tenantId)) return undefined;
    const tenantName = currentUser?.tenantName || '我的租户';
    return { id: tenantId, name: tenantName, code: tenantId.replace('TENANT-', ''), plan: '标准版', scope: currentUser?.tenantName ?? '新注册租户' };
  }, [currentUser?.tenantIds, currentUser?.tenantName]);
  const allTenantOptions = useMemo(() => (sessionTenant ? [...tenantOptions, sessionTenant] : tenantOptions), [sessionTenant]);
  const currentTenant = allTenantOptions.find((item) => item.id === currentTenantId) ?? allTenantOptions[0];

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
  }, [currentUser?.account]);

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
  }), [activeModule, moduleNavigationRevision, activeRole, currentTenant, currentTenantId, currentUser, navigateModule]);

  return <AppRuntimeContext.Provider value={value}>{children}</AppRuntimeContext.Provider>;
};

export const useAppRuntime = () => {
  const context = useContext(AppRuntimeContext);
  if (!context) throw new Error('useAppRuntime must be used within AppRuntimeProvider');
  return context;
};
