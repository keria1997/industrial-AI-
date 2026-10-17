export type ApiPage<T> = { items: T[]; total: number };

export function requireApiPage<T>(value: ApiPage<T>): ApiPage<T> {
  if (!value || !Array.isArray(value.items) || !Number.isInteger(value.total)
    || value.total < value.items.length) {
    throw new Error('返回的列表数据不完整，请重试');
  }
  return value;
}

// Counts must use a complete authorized collection, never the first page as a total.
export async function loadApiCollection<T>(
  load: (page: number, pageSize: number) => Promise<ApiPage<T>>,
): Promise<T[]> {
  const pageSize = 200;
  const first = requireApiPage(await load(1, pageSize));
  const rows = [...first.items];
  const pages = Math.ceil(first.total / pageSize);
  if (pages > 100) throw new Error('数据量超出完整统计范围，请使用汇总接口');
  for (let page = 2; page <= pages; page += 1) {
    const next = requireApiPage(await load(page, pageSize));
    if (next.total !== first.total) throw new Error('查询期间数据已变化，请刷新后重试');
    rows.push(...next.items);
  }
  if (rows.length !== first.total) throw new Error('未获取完整列表，请刷新后重试');
  return rows;
}
