/**
 * URL 路由
 *
 * 格式: ?module={moduleId}&tab={tabId}
 * 刷新后从 URL 恢复页面状态。
 */

import { findModuleById, moduleRegistry, type ModuleId, type ModuleLabel } from './moduleRegistry';

export function resolveModule(search: string): ModuleLabel {
  const params = new URLSearchParams(search);
  const mod = findModuleById(params.get('module'));
  return mod?.label ?? '工作台';
}

export function createModuleUrl(moduleId: ModuleId): string {
  const params = new URLSearchParams();
  if (moduleId !== 'workbench') params.set('module', moduleId);
  const qs = params.toString();
  return `/${qs ? `?${qs}` : ''}`;
}

