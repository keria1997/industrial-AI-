import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Controlled browser regression for the product API contract; does not write to a real backend.
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const writes = [];
let failSave = false;
let emptyWarehouses = false;
let omitSavedWarehouse = false;
const warehouses = [
  { id: 'warehouse-a', code: 'WH-A', name: '产品一仓', status: 'active' },
  { id: 'warehouse-b', code: 'WH-B', name: '产品二仓', status: 'active' },
  { id: 'warehouse-inactive', code: 'WH-OLD', name: '停用仓库', status: 'inactive' },
].map(item => ({ ...item, version: 1, type: '成品仓', updatedAt: '2026-10-17T00:00:00Z' }));
const product = (id, name, defaultWarehouseId) => ({
  id, code: id, name, defaultWarehouseId, specification: '规格', category: '成品', uom: 'PCS',
  unitPrice: '1', safetyStockQty: '0', status: 'active', version: 5, updatedAt: '2026-10-17T00:00:00Z',
});
const products = [
  product('UNASSIGNED', '待关联产品', null),
  product('OLD-PRODUCT', '停用仓关联产品', 'warehouse-inactive'),
];
const stock = [{
  warehouseId: 'warehouse-a', productId: 'UNASSIGNED', qualifiedOnHandQty: '8',
  allocatedReservedQty: '0', frozenQty: '0', fulfillableQty: '8', safetyStockQty: '0',
  inTransitQty: '0', uom: 'PCS', factVersion: 1,
}];

try {
  await context.addInitScript(() => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({
    account: 'warehouse-regression', name: '产品仓库验证员', role: '超级管理员', permissions: ['*'],
    tenantIds: ['TENANT-SHWS'], accessToken: 'controlled-product-warehouse', expiresAt: '2099-01-01T00:00:00Z',
  })));
  await context.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return route.fallback();
    if (request.method() !== 'GET') {
      const body = request.postDataJSON();
      writes.push({ path, method: request.method(), body, headers: request.headers() });
      assert(path === '/api/v1/inventory/products' || path.startsWith('/api/v1/inventory/products/'),
        `Unexpected business write: ${path}`);
      if (failSave) return route.fulfill({
        status: 422, json: { error: { code: 'WAREHOUSE_REQUIRED', message: '默认仓库不能为空' } },
      });
      let saved;
      if (request.method() === 'POST') {
        saved = { ...product(body.code, body.name, body.defaultWarehouseId ?? null), ...body, version: 1 };
        products.push(saved);
      } else {
        const index = products.findIndex(item => item.id === decodeURIComponent(path.split('/').at(-1)));
        assert(index >= 0);
        assert.equal(request.headers()['if-match'], `"${products[index].version}"`);
        saved = { ...products[index], ...body, version: products[index].version + 1 };
        products[index] = saved;
      }
      if (omitSavedWarehouse) delete saved.defaultWarehouseId;
      assert(request.headers()['x-idempotency-key']);
      assert.equal(request.headers()['x-tenant-id'], 'TENANT-SHWS');
      return route.fulfill({ status: request.method() === 'POST' ? 201 : 200, json: { product: saved } });
    }
    if (path.endsWith('/production/readiness')) return route.fulfill({ json: { permissions: ['*'] } });
    if (path.endsWith('/inventory/warehouses')) return route.fulfill({
      json: { items: emptyWarehouses ? [] : warehouses, total: emptyWarehouses ? 0 : warehouses.length },
    });
    if (path.endsWith('/inventory/products')) return route.fulfill({ json: { items: products, total: products.length } });
    if (path.endsWith('/inventory/availability')) return route.fulfill({ json: stock });
    if (path.endsWith('/platform/snapshot')) return route.fulfill({ json: {
      tenant: { id: 'TENANT-SHWS', name: '回归租户', status: 'running' },
      roles: [], permissions: [], roleGrants: [], orgUnits: [], resources: [], employees: [], accounts: [],
      positions: [], capabilities: [], adapters: [], dictionaries: [], parameters: [], approvalRules: [], audits: [],
    } });
    const arrayPaths = ['/production/inspections', '/production/completions', '/production/bom-snapshots', '/production/work-order-closes'];
    return route.fulfill({ json: arrayPaths.some(suffix => path.endsWith(suffix)) ? [] : { items: [], total: 0 } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const visit = () => page.goto(`${baseUrl}/?module=inventory&inventory=products`);
  const row = name => page.getByRole('row').filter({ hasText: name });
  const createDraft = async code => {
    await page.getByRole('button', { name: '新建产品', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新建产品', exact: true });
    await dialog.getByLabel('产品编码', { exact: true }).fill(code);
    await dialog.getByLabel('产品名称', { exact: true }).fill(code);
    await dialog.getByLabel('规格型号', { exact: true }).fill('规格');
    await dialog.getByLabel('基本单位', { exact: true }).fill('PCS');
    return dialog;
  };
  const save = async dialog => {
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  };
  await visit();
  await row('待关联产品').getByText('未关联', { exact: true }).waitFor();
  await page.getByRole('columnheader', { name: '库存仓库', exact: true }).waitFor();
  const blank = await createDraft('OPTIONAL-WAREHOUSE');
  const select = blank.getByRole('combobox', { name: '库存仓库', exact: true });
  assert(await select.isEnabled());
  assert.equal(await select.inputValue(), '');
  assert.equal(await select.locator('option:checked').innerText(), '暂不关联');
  assert.equal(await select.locator('option').count(), 3);
  await save(blank);
  assert(!('defaultWarehouseId' in writes.at(-1).body));
  await row('OPTIONAL-WAREHOUSE').getByText('未关联', { exact: true }).waitFor();
  console.log('PASS create: warehouse optional, no automatic association or inferred stock warehouse');

  const selected = await createDraft('SELECTED-WAREHOUSE');
  await selected.getByRole('combobox', { name: '库存仓库', exact: true }).selectOption('WH-A');
  await save(selected);
  assert.equal(writes.at(-1).body.defaultWarehouseId, 'warehouse-a');
  await row('SELECTED-WAREHOUSE').getByRole('button', { name: '产品一仓', exact: true }).waitFor();
  console.log('PASS create: selected warehouse uses server ID and reloads from API');

  await row('待关联产品').getByRole('button', { name: '编辑产品', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '编辑产品', exact: true });
  await edit.getByRole('combobox', { name: '库存仓库', exact: true }).selectOption('WH-B');
  await save(edit);
  assert.equal(writes.at(-1).method, 'PATCH');
  assert.equal(writes.at(-1).body.defaultWarehouseId, 'warehouse-b');
  await row('待关联产品').getByRole('button', { name: '产品二仓', exact: true }).waitFor();
  assert.equal((await row('待关联产品').getByRole('cell').allTextContents())[4], '-');
  await visit();
  await row('待关联产品').getByRole('button', { name: '编辑产品', exact: true }).click();
  assert.equal(await edit.getByRole('combobox', { name: '库存仓库', exact: true }).inputValue(), 'WH-B');
  await edit.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(stock[0].warehouseId, 'warehouse-a');
  console.log('PASS edit: association persists after reload without moving or fabricating stock');

  await row('停用仓关联产品').getByRole('button', { name: '编辑产品', exact: true }).click();
  const inactiveSelect = edit.getByRole('combobox', { name: '库存仓库', exact: true });
  assert.equal(await inactiveSelect.inputValue(), 'WH-OLD');
  assert.match(await inactiveSelect.locator('option:checked').innerText(), /已停用/);
  assert(await inactiveSelect.locator('option:checked').evaluate(option => option.disabled));
  await edit.getByLabel('产品名称', { exact: true }).fill('停用仓关联产品改名');
  await save(edit);
  assert(!('defaultWarehouseId' in writes.at(-1).body));
  console.log('PASS inactive: existing association remains visible without resubmitting an unchanged inactive warehouse');

  omitSavedWarehouse = true;
  const unconfirmed = await createDraft('UNCONFIRMED-WAREHOUSE');
  await unconfirmed.getByRole('combobox', { name: '库存仓库', exact: true }).selectOption('WH-A');
  await save(unconfirmed);
  await page.getByText('产品资料已提交，但库存仓库关联未确认，请刷新后检查', { exact: true }).waitFor();
  await row('UNCONFIRMED-WAREHOUSE').getByText('未关联', { exact: true }).waitFor();
  omitSavedWarehouse = false;
  console.log('PASS legacy response: missing warehouse acknowledgement shows a warning and reloads actual facts');

  failSave = true;
  const failed = await createDraft('FAILED-WAREHOUSE');
  await failed.getByRole('button', { name: '保存', exact: true }).click();
  await failed.getByRole('alert').filter({ hasText: '默认仓库不能为空' }).waitFor();
  assert.equal(await failed.getByLabel('产品名称', { exact: true }).inputValue(), 'FAILED-WAREHOUSE');
  assert.equal(await failed.getByRole('combobox', { name: '库存仓库', exact: true }).inputValue(), '');
  assert(!products.some(item => item.code === 'FAILED-WAREHOUSE'));
  await failed.getByRole('button', { name: '取消', exact: true }).click();
  failSave = false;
  console.log('PASS rejection: backend error preserves draft and never claims success');

  emptyWarehouses = true;
  await visit();
  const noOptions = await createDraft('NO-WAREHOUSES');
  assert.equal(await noOptions.getByRole('combobox', { name: '库存仓库', exact: true }).locator('option').count(), 1);
  await noOptions.getByText('暂无可选仓库，可暂不关联。', { exact: true }).waitFor();
  await save(noOptions);
  assert(!('defaultWarehouseId' in writes.at(-1).body));
  console.log('PASS empty options: no warehouse required by frontend');
  assert.deepEqual(errors, []);
} finally {
  await context.close();
  await browser.close();
}
