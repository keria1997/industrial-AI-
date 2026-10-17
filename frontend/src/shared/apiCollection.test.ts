import { describe, expect, it, vi } from 'vitest';
import { loadApiCollection, requireApiPage } from './apiCollection';

describe('complete API facts', () => {
  it('accepts an explicitly empty collection', async () => {
    expect(await loadApiCollection(async () => ({ items: [], total: 0 }))).toEqual([]);
  });

  it('loads every page before producing counts', async () => {
    const rows = Array.from({ length: 205 }, (_, id) => ({ id }));
    const load = vi.fn(async (page: number, size: number) => ({
      items: rows.slice((page - 1) * size, page * size), total: rows.length,
    }));
    expect(await loadApiCollection(load)).toEqual(rows);
    expect(load.mock.calls).toEqual([[1, 200], [2, 200]]);
  });

  it('never converts an API failure or malformed response to zero', async () => {
    await expect(loadApiCollection(async () => { throw new Error('Unavailable'); })).rejects.toThrow('Unavailable');
    for (const value of [null, {}, { items: null, total: 0 }, { items: [], total: -1 }, { items: [], total: '0' }]) {
      expect(() => requireApiPage(value as any)).toThrow();
    }
  });

  it('rejects incomplete and changing collections', async () => {
    await expect(loadApiCollection(async () => ({ items: [], total: 1 }))).rejects.toThrow('完整列表');
    await expect(loadApiCollection(async page => ({
      items: Array.from({ length: page === 1 ? 200 : 2 }, (_, id) => id),
      total: page === 1 ? 201 : 202,
    }))).rejects.toThrow('数据已变化');
  });
});
