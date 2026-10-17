import { apiRequest, type ApiContext } from '../api/client';
import type { PlatformState } from './platformSeed';
import { platformApi } from '../api/platform/client';

const paths = {
  orgUnits: 'org-units', resources: 'resources', positions: 'positions', employees: 'employees',
  accounts: 'accounts', roles: 'roles', approvalRules: 'approval-rules',
  dictionaries: 'dictionaries', parameters: 'parameters', adapters: 'adapters',
} as const;

type Entity = { id: string; version?: number; status?: string; [key: string]: unknown };

// Existing form drafts select one business command. Only the API snapshot is rendered.
export async function persistPlatformChange(context: ApiContext, previous: PlatformState, next: PlatformState) {
  const commands: Array<() => Promise<unknown>> = [];
  if (JSON.stringify(previous.tenant) !== JSON.stringify(next.tenant)) {
    const editable = ['name', 'edition', 'status', 'expireAt'];
    const changed = Object.keys({ ...previous.tenant, ...next.tenant })
      .filter(field => JSON.stringify(previous.tenant[field]) !== JSON.stringify(next.tenant[field]));
    if (changed.some(field => !editable.includes(field))) {
      throw new Error('未保存：当前企业资料接口不支持管理员交接或租户标识变更');
    }
    if (!previous.tenant.version) throw new Error('服务端版本未加载，请刷新后重试');
    commands.push(() => platformApi.updateTenant(context, {
      ...Object.fromEntries(changed.map(field => [field, next.tenant[field]])), version: previous.tenant.version,
    }));
  }
  if (JSON.stringify(previous.capabilities) !== JSON.stringify(next.capabilities)) {
    const changed = next.capabilities.filter(item =>
      JSON.stringify(item) !== JSON.stringify(previous.capabilities.find(old => old.code === item.code)));
    changed.forEach(item => commands.push(() => apiRequest('/api/v1/platform/capabilities', context, {
      method: 'POST', idempotencyKey: `capability:${crypto.randomUUID()}`, body: JSON.stringify({ code: item.code, enabled: item.enabled }),
    })));
  }
  for (const [collection, path] of Object.entries(paths)) {
    const before = previous[collection] as Entity[];
    const after = next[collection] as Entity[];
    for (const item of after) {
      const current = before.find(old => old.id === item.id);
      if (JSON.stringify(current) === JSON.stringify(item)) continue;
      if (collection === 'adapters' && item.status === 'synced') {
        if (!current?.version) throw new Error('服务端版本未加载，请刷新后重试');
        const syncFields = ['status', 'lastSyncAt', 'errorMessage'];
        if (Object.keys({ ...current, ...item }).some(field =>
          !syncFields.includes(field) && JSON.stringify(current[field]) !== JSON.stringify(item[field]))) {
          throw new Error('请先保存映射配置，再单独提交同步');
        }
        commands.push(() => platformApi.syncAdapter(context, current.id, current.version!));
        continue;
      }
      if (current && !current.version) throw new Error('服务端版本未加载，请刷新后重试');
      commands.push(() => apiRequest(`/api/v1/platform/${path}${current ? `/${encodeURIComponent(current.id)}` : ''}`, context, {
        method: current ? 'PUT' : 'POST', expectedVersion: current?.version,
        idempotencyKey: `${path}:${crypto.randomUUID()}`, body: JSON.stringify(item),
      }));
    }
    for (const current of before.filter(item => !after.some(row => row.id === item.id))) {
      if (!current.version) throw new Error('服务端版本未加载，请刷新后重试');
      commands.push(() => apiRequest(`/api/v1/platform/${path}/${encodeURIComponent(current.id)}`, context, {
        method: 'DELETE', expectedVersion: current.version, idempotencyKey: `${path}:delete:${crypto.randomUUID()}`,
      }));
    }
  }
  if (commands.length !== 1) throw new Error('本次操作必须对应一条正式业务命令，请刷新后分别提交');
  await commands[0]();
}
