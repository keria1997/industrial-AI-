/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

const appModules = import.meta.glob('../../App.tsx', {
  eager: true,
  import: 'default',
  query: '?raw',
});
const appSource = appModules['../../App.tsx'] as string;

describe('production module entry policy', () => {
  it('keeps the user-approved legacy production module as the only mounted entry', () => {
    expect(appSource).toContain("{activeModule === '生产管理' && <LegacyProductionManagement");
    expect(appSource).not.toContain("{activeModule === '生产管理' && <ProductionOperations");
    expect(appSource).not.toContain("activeTab === 'operations' && <ProductionOperations");
    expect(appSource).not.toContain('> 正式作业</button>');
  });

  it('keeps legacy production dialogs above the module navigation', () => {
    const productionSource = appSource.slice(
      appSource.indexOf('const Prod_RecordModal'),
      appSource.indexOf('const Inv_RecordModal'),
    );

    expect(productionSource).not.toMatch(/fixed inset-0[^"\n]*\bz-50\b/);
    expect(productionSource.match(/fixed inset-0 z-\[120\]/g)).toHaveLength(9);
    expect(appSource).not.toContain('mx-auto relative z-20">\n              <div className="flex justify-between items-start"');
    expect(appSource).not.toContain('<main className="flex-1 w-full max-w-[1600px] mx-auto px-8 pb-8 flex flex-col relative z-10 overflow-hidden">');
  });
});
