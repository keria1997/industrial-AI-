import {
  findModuleById,
  findModuleByLabel,
  type ModuleLabel,
} from './moduleRegistry';

export type AppLocation = Pick<Location, 'pathname' | 'search' | 'hash'>;

export const defaultModule: ModuleLabel = '工作台';

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

  if (module.label === defaultModule) searchParams.delete('module');
  else searchParams.set('module', module.id);

  if (module.id === 'platform') {
    if (!searchParams.has('platform')) searchParams.set('platform', 'tenant');
  } else {
    searchParams.delete('platform');
  }

  if (module.id === 'production') {
    if (!searchParams.has('production')) searchParams.set('production', 'dashboard');
  } else {
    searchParams.delete('production');
  }

  if (module.id !== 'sales') {
    searchParams.delete('tab');
    searchParams.delete('focusOrder');
  }

  if (module.id === 'inventory') {
    if (!searchParams.has('inventory')) searchParams.set('inventory', 'dashboard');
    if (searchParams.get('inventory') !== 'outbound') searchParams.delete('sourceOrder');
  } else {
    searchParams.delete('inventory');
    searchParams.delete('sourceOrder');
  }

  const search = searchParams.toString();
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash}`;
};
