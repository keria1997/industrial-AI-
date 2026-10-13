import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(resolve(repo, '.env.local'));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = 'http://127.0.0.1:5175';
const output = resolve(repo, 'deploy/artifacts/local-runtime/verification');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROME_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH } : {}) });
const evidence = { at: new Date().toISOString(), businessWrites: 0, viewports: [] };
try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const captcha = page.locator('img[src^="data:image"]').first();
    await captcha.waitFor();
    const image = await captcha.getAttribute('src');
    const code = decodeURIComponent(image.split(',').slice(1).join(',')).match(/letter-spacing="7">([^<]+)</)?.[1];
    assert.ok(code, 'Login CAPTCHA is available');
    await page.locator('input').nth(0).fill(process.env.RELEASE_VERIFY_ACCOUNT || process.env.DEMO_AUTH_ACCOUNT.split(',')[0]);
    await page.locator('input').nth(1).fill(process.env.RELEASE_VERIFY_PASSWORD || process.env.DEMO_AUTH_PASSWORD);
    await page.locator('input').nth(2).fill(code);
    await page.getByRole('button', { name: '立即登录', exact: true }).click();
    await page.getByRole('button', { name: /销售管理/ }).first().waitFor();
    const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem('industrial-ai-session:v2')));
    const tenantId = process.env.RELEASE_VERIFY_TENANT || session.tenantIds[0];
    const headers = { Authorization: `Bearer ${session.accessToken}`, 'X-Tenant-Id': tenantId };
    const api = async (path, origin = base) => {
      const response = await page.request.get(`${origin}${path}`, { headers });
      assert.ok(response.ok(), `GET ${path}: ${response.status()}`);
      return response.json();
    };
    const { items: warehouses } = await api('/api/v1/inventory/warehouses');
    const facts = await api('/api/v1/inventory/availability');
    assert.deepEqual(facts, await api('/api/v1/inventory/availability', 'http://127.0.0.1:8081'));
    const db = new URL(process.env.DATABASE_URL.replace(/^jdbc:/, ''));
    const pgEnv = { ...process.env, PGHOST: db.hostname, PGPORT: db.port || '5432',
      PGDATABASE: db.pathname.slice(1), PGUSER: decodeURIComponent(db.username) || process.env.USER,
      PGPASSWORD: decodeURIComponent(db.password) };
    const stored = JSON.parse(execFileSync('psql', ['-X', '-tA', '-v', 'ON_ERROR_STOP=1', '-c',
      "SELECT COALESCE(jsonb_agg(jsonb_build_object('tenantId',tenant_id,'warehouseId',data->>'warehouseId',"
      + "'productId',data->>'productId','qualifiedOnHandQty',data->>'qualifiedOnHandQty',"
      + "'allocatedReservedQty',data->>'allocatedReservedQty','frozenQty',data->>'frozenQty',"
      + "'fulfillableQty',data->>'fulfillableQty','factVersion',data->'factVersion')),'[]'::jsonb)"
      + " FROM module_document WHERE module='fulfillment' AND kind='availability';"],
    { env: pgEnv, encoding: 'utf8' }));
    for (const fact of facts) {
      const warehouse = warehouses.find(item => item.id === fact.warehouseId || item.code === fact.warehouseId);
      assert.ok(warehouse, `Persisted warehouse for ${fact.productId}`);
      const matching = stored.filter(item => item.tenantId === tenantId && item.productId === fact.productId
        && [warehouse.id, warehouse.code].includes(item.warehouseId));
      assert.equal(matching.length, 1, 'Exactly one persisted fact per warehouse/product');
      for (const field of ['qualifiedOnHandQty', 'allocatedReservedQty', 'frozenQty', 'fulfillableQty', 'factVersion']) {
        assert.equal(String(fact[field]), String(matching[0][field]), `API/database ${field}`);
      }
    }
    const checked = [];
    for (const warehouse of warehouses.filter(item => facts.some(fact => fact.warehouseId === item.id))) {
      const byId = await api(`/api/v1/inventory/availability?warehouseId=${encodeURIComponent(warehouse.id)}`);
      assert.deepEqual(byId, await api(`/api/v1/inventory/availability?warehouseId=${encodeURIComponent(warehouse.code)}`));
      for (const id of [warehouse.id, warehouse.code]) {
        await page.goto(`${base}/?module=inventory&inventory=warehouses&warehouseId=${encodeURIComponent(id)}`);
        await page.getByRole('heading', { name: warehouse.name, exact: true }).waitFor();
        for (const fact of byId) {
          const cells = page.locator('tbody tr').filter({ hasText: fact.productId }).locator('td');
          await cells.nth(4).waitFor();
          assert.equal((await cells.nth(4).innerText()).trim(), `${Number(fact.qualifiedOnHandQty)} ${fact.uom}`);
          assert.equal((await cells.nth(5).innerText()).trim(), String(Number(fact.allocatedReservedQty) + Number(fact.frozenQty)));
          assert.equal((await cells.nth(6).innerText()).trim(), String(Number(fact.fulfillableQty)));
        }
      }
      await page.screenshot({ path: resolve(output, `warehouse-${warehouse.code}-${viewport.width}.png`), fullPage: true });
      checked.push({ id: warehouse.id, code: warehouse.code, facts: byId });
    }
    await page.goto(`${base}/?module=inventory&inventory=stock`);
    await page.getByRole('heading', { name: '库存查询', exact: true }).waitFor();
    for (const fact of facts) {
      const warehouse = warehouses.find(item => item.id === fact.warehouseId);
      const cells = page.locator('tbody tr').filter({ hasText: fact.productId }).filter({ hasText: warehouse.name }).locator('td');
      assert.equal((await cells.nth(4).innerText()).trim(), `${Number(fact.qualifiedOnHandQty)} ${fact.uom}`);
      assert.equal((await cells.nth(6).innerText()).trim(), String(Number(fact.fulfillableQty)));
    }
    await page.screenshot({ path: resolve(output, `stock-${viewport.width}.png`), fullPage: true });
    const tasks = await api('/api/v1/inventory/shipment-tasks?page=1&pageSize=200');
    for (const task of tasks.items.filter(item => item.outboundId)) {
      const outbound = await api(`/api/v1/inventory/outbounds/${task.outboundId}`);
      const order = await api(`/api/v1/sales/sales-orders/${task.salesOrderId}`);
      assert.equal(outbound.salesOrderId, order.id);
      for (const line of task.lines) {
        const outboundLine = outbound.lines.find(item => item.orderLineId === line.orderLineId);
        if (outboundLine) assert.equal(Number(line.postedQty), Number(outboundLine.postedQty));
      }
    }
    let shipmentUnitCheck;
    if (process.env.RELEASE_VERIFY_SALES_ORDER) {
      const task = tasks.items.find(item => item.salesOrderNo === process.env.RELEASE_VERIFY_SALES_ORDER);
      assert.ok(task, 'Affected shipment task exists');
      const orderPath = `/api/v1/sales/sales-orders/${task.salesOrderId}`;
      const taskPath = `/api/v1/inventory/shipment-tasks/${task.id}`;
      const beforeOrder = await api(orderPath);
      const beforeTask = await api(taskPath);
      const beforeFacts = await api(`/api/v1/inventory/availability?warehouseId=${task.warehouseId}`);
      const writes = [];
      await page.route('**/api/v1/**', route => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
          writes.push({ method: route.request().method(), path: new URL(route.request().url()).pathname });
          return route.abort();
        }
        return route.continue();
      });
      await page.goto(`${base}/?module=inventory&inventory=outbound&sourceOrder=${encodeURIComponent(task.salesOrderNo)}`);
      await page.getByRole('searchbox').fill(task.salesOrderNo);
      const row = page.locator('tbody tr').filter({ hasText: task.salesOrderNo });
      await row.getByRole('button', { name: '去发货', exact: true }).click();
      const modal = page.locator('div.fixed.inset-0').filter({
        has: page.getByRole('heading', { name: '确认销售发货', exact: true }),
      });
      await modal.locator('select').selectOption(task.warehouseId);
      const quantity = modal.getByRole('spinbutton', { name: `${task.lines[0].productId} 本次发货数量` });
      await quantity.waitFor();
      assert.equal(await quantity.inputValue(), task.lines[0].requestedQty);
      assert.equal(await modal.getByRole('button', { name: '去发货', exact: true }).isEnabled(), true);
      assert.equal(await modal.getByText('订单行与库存单位不一致', { exact: false }).count(), 0);
      await page.screenshot({ path: resolve(output, `shipment-unit-${viewport.width}.png`), fullPage: true });
      assert.deepEqual(await api(orderPath), beforeOrder, 'Order remains unchanged');
      assert.deepEqual(await api(taskPath), beforeTask, 'Task remains unchanged');
      assert.deepEqual(await api(`/api/v1/inventory/availability?warehouseId=${task.warehouseId}`),
        beforeFacts, 'Inventory remains unchanged');
      assert.deepEqual(writes, [], 'No business writes during unit verification');
      shipmentUnitCheck = { orderNo: task.salesOrderNo, taskId: task.id,
        orderUnits: task.lines.map(line => line.uom), facts: beforeFacts,
        confirmEnabled: true, businessWrites: writes.length };
    }
    assert.deepEqual(errors, []);
    evidence.viewports.push({ viewport, tenantId, checked, taskCount: tasks.total, pageErrors: errors, shipmentUnitCheck });
    await page.close();
  }
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`Read-only inventory deployment verification passed: ${output}`);
} finally { await browser.close(); }
