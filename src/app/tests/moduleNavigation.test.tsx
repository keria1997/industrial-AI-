import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRuntimeProvider } from '../AppRuntimeProvider';

const hooks = vi.hoisted(() => ({
  cursor: 0,
  values: [] as unknown[],
  effects: [] as Array<() => unknown>,
}));

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) {
      hooks.values[index] = typeof initial === 'function' ? initial() : initial;
    }
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next;
    }];
  },
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
}));

vi.mock('../../api/session', () => ({
  loadAuthenticatedSession: () => null,
  clearAuthenticatedSession: vi.fn(),
}));

const renderRuntime = () => {
  hooks.cursor = 0;
  hooks.effects = [];
  return AppRuntimeProvider({ children: null }).props.value;
};

describe('module navigation lifecycle', () => {
  let currentLocation: URL;
  let historyWrites: string[];
  let listeners: Map<string, () => void>;

  beforeEach(() => {
    hooks.values = [];
    currentLocation = new URL('https://example.test/?module=finance');
    historyWrites = [];
    listeners = new Map();
    const writeHistory = (_state: unknown, _title: string, url: string) => {
      historyWrites.push(url);
      currentLocation = new URL(url, currentLocation);
    };
    vi.stubGlobal('window', {
      get location() { return currentLocation; },
      localStorage: { getItem: () => null, setItem: vi.fn() },
      history: { pushState: writeHistory, replaceState: writeHistory },
      addEventListener: (event: string, listener: () => void) => listeners.set(event, listener),
      removeEventListener: (event: string) => listeners.delete(event),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('re-enters the current module even if a local tab did not change the URL', () => {
    const initial = renderRuntime();
    initial.navigateModule('财务管理');
    const revisited = renderRuntime();
    expect(revisited.activeModule).toBe('财务管理');
    expect(revisited.moduleNavigationRevision).toBe(initial.moduleNavigationRevision + 1);
    expect(historyWrites).toEqual([]);
    revisited.navigateModule('财务管理');
    expect(renderRuntime().moduleNavigationRevision).toBe(revisited.moduleNavigationRevision + 1);
    expect(historyWrites).toEqual([]);
  });

  it('writes the default URL before initializing a revisited module', () => {
    currentLocation = new URL('https://example.test/?module=production&production=orders&focusMps=MPS-1');
    renderRuntime().navigateModule('生产管理');
    const revisited = renderRuntime();
    expect(revisited.activeModule).toBe('生产管理');
    expect(currentLocation.searchParams.get('production')).toBe('dashboard');
    expect(currentLocation.searchParams.has('focusMps')).toBe(false);
    expect(revisited.moduleNavigationRevision).toBe(1);
  });

  it('keeps explicit business destinations and clears them on the next menu click', () => {
    renderRuntime().navigateModule('库存管理', {
      query: { inventory: 'outbound', sourceOrder: 'SO-1' },
    });
    expect(currentLocation.searchParams.get('inventory')).toBe('outbound');
    expect(currentLocation.searchParams.get('sourceOrder')).toBe('SO-1');
    renderRuntime().navigateModule('库存管理');
    expect(currentLocation.searchParams.get('inventory')).toBe('dashboard');
    expect(currentLocation.searchParams.has('sourceOrder')).toBe(false);
    expect(renderRuntime().moduleNavigationRevision).toBe(2);
  });

  it('re-initializes a module from its URL on browser history navigation', () => {
    const runtime = renderRuntime();
    hooks.effects.forEach((effect) => effect());
    currentLocation = new URL('https://example.test/?module=production&production=mps');
    listeners.get('popstate')!();
    const restored = renderRuntime();
    expect(restored.activeModule).toBe('生产管理');
    expect(restored.moduleNavigationRevision).toBe(runtime.moduleNavigationRevision + 1);
    expect(currentLocation.searchParams.get('production')).toBe('mps');
    expect(historyWrites).toEqual([]);
  });
});
