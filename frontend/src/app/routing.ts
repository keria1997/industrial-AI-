import {
  findModuleById,
  findModuleByLabel,
  type ModuleId,
  type ModuleLabel,
} from './moduleRegistry';

export type AppLocation = Pick<Location, 'pathname' | 'search' | 'hash'>;

export const defaultModule: ModuleLabel = '工作台';

const moduleOwnedSearchParams: Record<ModuleId, readonly string[]> = {
  workbench: [],
  sales: ['tab', 'focusOrder', 'quickCreate'],
  inventory: ['inventory', 'sourceOrder', 'focusOutbound', 'warehouseId'],
  production: ['production', 'focusMps', 'focusOrder'],
  procurement: ['procurement', 'focusPr', 'focusPo'],
  finance: ['finance', 'focusAr', 'focusAp'],
  personnel: [],
  'supply-chain': [],
  'ai-hub': [],
  analytics: [],
  messages: [],
  platform: ['platform'],
  feedback: [],
};

const allModuleOwnedSearchParams = new Set(
  Object.values(moduleOwnedSearchParams).flat(),
);

export const resolveModuleFromLocation = (location: AppLocation): ModuleLabel => {
  const searchParams = new URLSearchParams(location.search);
  const registeredModule = findModuleById(searchParams.get('module'));
  if (registeredModule) return registeredModule.label;

  // Preserve links created before the module registry was introduced.
  if (searchParams.has('production')) return '生产管理';
  if (searchParams.has('platform')) return '平台管理';
  return defaultModule;
};

export const createModuleUrl = (location: AppLocation, requestedModule: string) => {
  const module = findModuleByLabel(requestedModule) ?? findModuleByLabel(defaultModule)!;
  const searchParams = new URLSearchParams(location.search);

  allModuleOwnedSearchParams.forEach((key) => searchParams.delete(key));
  searchParams.delete('focusId');
  searchParams.delete('focusNo');
  if (module.label === defaultModule) searchParams.delete('module');
  else searchParams.set('module', module.id);

  if (module.id === 'production') searchParams.set('production', 'dashboard');
  if (module.id === 'procurement') searchParams.set('procurement', 'dashboard');
  if (module.id === 'inventory') searchParams.set('inventory', 'dashboard');
  if (module.id === 'platform') searchParams.set('platform', 'tenant');

  const search = searchParams.toString();
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash}`;
};
