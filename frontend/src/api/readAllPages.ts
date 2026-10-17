import { apiRequest, type ApiContext } from './client';

/** Read a complete authorized collection, failing explicitly on truncated or unstable paging. */
export async function readAllPages<T extends { id: string }>(path: string, context: ApiContext) {
  const items: T[] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  for (let page = 1; page <= 1000; page++) {
    const separator = path.includes('?') ? '&' : '?';
    const result = await apiRequest<{ items: T[]; total: number }>(
      `${path}${separator}page=${page}&pageSize=200`, context,
    );
    if (!Array.isArray(result?.items) || !Number.isSafeInteger(result.total) || result.total < 0) {
      throw new Error('列表分页响应与契约不一致');
    }
    if (total !== undefined && result.total !== total) throw new Error('查询期间列表发生变化，请刷新后重试');
    total = result.total;
    if (result.items.some(item => !item?.id || seen.has(item.id))) throw new Error('列表分页记录重复，请刷新后重试');
    for (const item of result.items) {
      if (seen.has(item.id)) throw new Error('列表分页记录重复，请刷新后重试');
      items.push(item);
      seen.add(item.id);
    }
    if (items.length === total) return { items, total };
    if (items.length > total || result.items.length === 0) throw new Error('列表分页不完整，请刷新后重试');
  }
  throw new Error('列表超出完整读取上限，请缩小查询范围');
}
