import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SHIPMENT_E2E_URL || 'http://127.0.0.1:5176';
const artifacts = resolve(process.env.SHIPMENT_E2E_ARTIFACTS || 'docs/tests/artifacts/sales-shipment-20261013');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROME_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH } : {}),
});
const evidence = [];

try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    const page = await browser.newPage({ viewport });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const size = `${viewport.width}x${viewport.height}`;
    try {
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      const captcha = page.locator('img[src^="data:image"]').first();
      await captcha.waitFor();
      const image = await captcha.getAttribute('src');
      const code = decodeURIComponent(image.split(',').slice(1).join(',')).match(/letter-spacing="7">([^<]+)</)?.[1];
      assert.ok(code, 'Development CAPTCHA must be available');
      await page.locator('input').nth(0).fill(process.env.SHIPMENT_E2E_ACCOUNT || 'test01');
      await page.locator('input').nth(1).fill(process.env.SHIPMENT_E2E_PASSWORD || '123456');
      await page.locator('input').nth(2).fill(code);
      await page.getByRole('button', { name: '立即登录', exact: true }).click();
      await page.getByRole('button', { name: /销售管理/ }).first().waitFor();
      const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem('industrial-ai-session:v2')));
      const tenantId = 'TENANT-SHWS';
      const headers = { Authorization: `Bearer ${session.accessToken}`, 'X-Tenant-Id': tenantId };
      const api = async (path, body, version) => {
        const response = body === undefined
          ? await page.request.get(`${base}${path}`, { headers })
          : await page.request.post(`${base}${path}`, {
            headers: { ...headers, 'X-Idempotency-Key': randomUUID(), ...(version ? { 'If-Match': `"${version}"` } : {}) },
            data: body,
          });
        const value = await response.json();
        assert.ok(response.ok(), `${path}: ${response.status()} ${JSON.stringify(value)}`);
        return value;
      };
      const marker = `SHIP-${size}-${Date.now()}`;
      const warehouse = (await api('/api/v1/inventory/warehouses', { code: marker, name: marker, type: 'standard' })).warehouse;
      const productIds = [`FG-${marker}-A`, `FG-${marker}-B`];
      const missingProduct = `FG-${marker}-MISSING`;
      await page.evaluate(({ tenantId, warehouseCode, missingProduct }) => {
        const storageKey = `industrial-ai-inventory-master-data:v1:${tenantId}`;
        const data = JSON.parse(localStorage.getItem(storageKey) || '{"schemaVersion":1,"warehouses":[],"products":[],"materials":[]}');
        data.products.push({ id: missingProduct, name: missingProduct, specification: 'Test', category: '成品',
          unit: 'PCS', unitPrice: 0, defaultWarehouseId: warehouseCode, safetyStock: 0,
          traceMode: '不追溯', status: '启用', updatedAt: new Date().toISOString() });
        localStorage.setItem(storageKey, JSON.stringify(data));
      }, { tenantId, warehouseCode: warehouse.code, missingProduct });
      for (const product of productIds) {
        await api('/api/v1/inventory/products', { code: product, name: product, uom: 'PCS', unitPrice: '10' });
      }
      const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const order = await api('/api/v1/sales/sales-orders', {
        customerId: marker, customerName: marker, ownerEmployeeId: 'test01',
        fulfillmentWarehouseId: warehouse.id, factoryResourceId: 'FAC-SH-01',
        requestedDeliveryDate: dueDate, allowPartialShipment: true, currency: 'CNY',
        recipient: { name: 'Receiver', phone: '13800138000', country: 'China', province: 'Shanghai', city: 'Shanghai', address: 'Test address' },
        lines: productIds.map((productId, index) => ({
          lineNo: index + 1, productId, orderedQty: index === 0 ? '5' : '3', uom: 'PCS',
          unitPrice: '10', taxRate: '0', promisedDate: dueDate, allowPartialShipment: true,
        })),
      });
      await api(`/api/v1/sales/sales-orders/${order.id}/review-decisions`, { decision: 'APPROVE' }, order.version);
      const stock = async (productId, qualified, allocated, factVersion) => api('/api/v1/inventory/internal/availability-events', {
        eventId: randomUUID(), warehouseId: warehouse.code, productId,
        qualifiedOnHandQty: String(qualified), allocatedReservedQty: String(allocated), frozenQty: '0',
        safetyStockQty: '0', inTransitQty: '0', fulfillableQty: String(qualified - allocated), uom: 'PCS',
        formulaVersion: 'FULFILLABLE-V1', factVersion, sourceSystem: 'E2E_FIXTURE', asOf: new Date().toISOString(),
      });
      await stock(productIds[0], 3, 0, 1);
      await stock(productIds[1], 3, 0, 1);
      const checkWarehouseStock = async (expected, label) => {
        const factsByCode = await api(`/api/v1/inventory/availability?warehouseId=${warehouse.code}`);
        const factsById = await api(`/api/v1/inventory/availability?warehouseId=${warehouse.id}`);
        assert.deepEqual(factsByCode, factsById, 'Warehouse code and ID must resolve to the same facts');
        if (label !== 'before') {
          await page.getByRole('button', { name: '仓库', exact: true }).click();
          await page.locator('tbody tr').filter({ hasText: warehouse.name }).getByTitle('查看仓库库存').click();
          const cells = page.locator('tbody tr').filter({ hasText: productIds[0] }).locator('td');
          assert.equal((await cells.nth(4).innerText()).trim(), `${expected[0][0]} PCS`,
            'Posting must refresh the still-mounted inventory module before any page reload');
          assert.equal((await cells.nth(5).innerText()).trim(), String(expected[0][1]));
        }
        for (const id of [warehouse.code, warehouse.id]) {
          await page.goto(`${base}/?module=inventory&inventory=warehouses&warehouseId=${id}`);
          await page.getByRole('heading', { name: warehouse.name, exact: true }).waitFor();
          for (let index = 0; index < productIds.length; index++) {
            const cells = page.locator('tbody tr').filter({ hasText: productIds[index] }).locator('td');
            await cells.nth(4).waitFor();
            assert.equal((await cells.nth(4).innerText()).trim(), `${expected[index][0]} PCS`);
            assert.equal((await cells.nth(5).innerText()).trim(), String(expected[index][1]));
            assert.equal((await cells.nth(6).innerText()).trim(), String(expected[index][2]));
          }
          const missingCells = page.locator('tbody tr').filter({ hasText: missingProduct }).locator('td');
          assert.equal((await missingCells.nth(6).innerText()).trim(), '-');
          assert.match(await missingCells.nth(8).innerText(), /未查询到库存记录/);
        }
        await page.screenshot({ path: `${artifacts}/warehouse-stock-${label}-${size}.png`, fullPage: true });
        await page.goto(`${base}/?module=inventory&inventory=stock`);
        await page.getByRole('heading', { name: '库存查询', exact: true }).waitFor();
        await page.getByPlaceholder('搜索编码、名称、规格或库位').fill(marker);
        for (let index = 0; index < productIds.length; index++) {
          const cells = page.locator('tbody tr').filter({ hasText: productIds[index] }).filter({ hasText: warehouse.name }).locator('td');
          assert.equal((await cells.nth(4).innerText()).trim(), `${expected[index][0]} PCS`);
          assert.equal((await cells.nth(5).innerText()).trim(), String(expected[index][1]));
          assert.equal((await cells.nth(6).innerText()).trim(), String(expected[index][2]));
          assert.equal(await cells.nth(9).getByTitle('编辑库存').count(), 0);
        }
        await page.screenshot({ path: `${artifacts}/stock-query-${label}-${size}.png`, fullPage: true });
        return factsById;
      };
      await checkWarehouseStock([[3, 0, 3], [3, 0, 3]], 'before');

      let unblockStock;
      const pendingStock = new Promise(resolve => { unblockStock = resolve; });
      await page.route('**/api/v1/inventory/availability', async route => {
        await pendingStock;
        await route.continue();
      });
      await page.goto(`${base}/?module=inventory&inventory=warehouses&warehouseId=${warehouse.code}`);
      await page.getByRole('status').filter({ hasText: '正在加载仓库库存' }).waitFor();
      assert.equal(await page.locator('tbody tr').filter({ hasText: productIds[0] }).count(), 0);
      unblockStock();
      await page.getByRole('heading', { name: warehouse.name, exact: true }).waitFor();
      await page.unroute('**/api/v1/inventory/availability');
      let failStock = true;
      await page.route('**/api/v1/inventory/availability', async route => {
        if (failStock) await route.fulfill({ status: 503, contentType: 'application/json',
          body: JSON.stringify({ error: { message: '库存暂时不可用，请重试' } }) });
        else await route.continue();
      });
      await page.reload();
      await page.getByRole('alert').filter({ hasText: '库存暂时不可用' }).waitFor();
      assert.equal(await page.locator('tbody tr').filter({ hasText: productIds[0] }).count(), 0);
      failStock = false;
      await page.getByRole('button', { name: '重新加载', exact: true }).click();
      await page.getByRole('heading', { name: warehouse.name, exact: true }).waitFor();
      await page.unroute('**/api/v1/inventory/availability');
      const salesUrl = `${base}/?module=sales&tab=orders&focusOrder=${order.orderNo}`;
      await page.goto(salesUrl);
      const salesRow = () => page.locator('tbody tr').filter({ hasText: order.orderNo });
      await salesRow().getByTitle('确认订单', { exact: true }).click();
      const confirmation = page.locator('[role="dialog"]').filter({ hasText: '确认销售发货内容' });
      await confirmation.getByRole('button', { name: '确认订单', exact: true }).click();
      await salesRow().getByTitle('去发货', { exact: true }).waitFor();
      let persisted = await api(`/api/v1/sales/sales-orders/${order.id}`);
      assert.equal(persisted.overallStatus, 'CONFIRMED');
      assert.equal((await api(`/api/v1/inventory/shipment-tasks?salesOrderId=${order.id}`)).total, 0);
      await page.screenshot({ path: `${artifacts}/sales-confirmed-${size}.png`, fullPage: true });

      await salesRow().getByTitle('去发货', { exact: true }).click();
      await page.getByRole('heading', { name: '已通知仓库准备发货', exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('module'), 'sales');
      await page.getByRole('button', { name: '我知道了', exact: true }).click();
      assert.equal(new URL(page.url()).searchParams.get('module'), 'sales');
      await salesRow().getByTitle('去发货', { exact: true }).click();
      await page.getByRole('button', { name: '进入出库管理', exact: true }).click();
      await page.getByRole('button', { name: '返回销售订单', exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('sourceOrder'), order.id);
      let tasks = await api(`/api/v1/inventory/shipment-tasks?salesOrderId=${order.id}`);
      assert.equal(tasks.total, 1, 'Repeated handoff must reuse the original request');
      const warehouseRow = () => page.locator('tbody tr').filter({ hasText: order.orderNo });
      await warehouseRow().getByRole('button', { name: '去发货', exact: true }).click();
      const shipmentDialog = () => page.locator('div.fixed.inset-0').filter({
        has: page.getByRole('heading', { name: /^(确认销售发货|继续销售发货)$/ }),
      });
      await shipmentDialog().locator('select').selectOption(warehouse.id);
      await shipmentDialog().locator('tbody tr').filter({ hasText: productIds[0] }).locator('input[type="number"]').fill('2');
      await page.screenshot({ path: `${artifacts}/warehouse-partial-${size}.png`, fullPage: true });
      const [firstResponse] = await Promise.all([
        page.waitForResponse(response => /\/outbounds\/[^/]+\/post$/.test(response.url())),
        shipmentDialog().getByRole('button', { name: '部分发货', exact: true }).click(),
      ]);
      assert.equal(firstResponse.status(), 200);
      const firstPost = await firstResponse.json();
      assert.equal(firstPost.order.overallStatus, 'PARTIALLY_SHIPPED');
      assert.deepEqual(firstPost.order.lines.map(line => line.shippedQty), ['2', '3']);
      assert.deepEqual(firstPost.order.lines.map(line => line.remainingQty), ['3', '0']);
      await shipmentDialog().waitFor({ state: 'hidden' });
      await checkWarehouseStock([[1, 1, 0], [0, 0, 0]], 'partial');
      await page.goto(salesUrl);
      await salesRow().getByTitle('查看', { exact: true }).waitFor();
      await salesRow().getByText('部分发货', { exact: true }).first().waitFor();
      assert.match(await salesRow().innerText(), /部分发货/);
      await page.reload();
      await salesRow().getByTitle('查看', { exact: true }).waitFor();
      await salesRow().getByText('部分发货', { exact: true }).first().waitFor();
      assert.match(await salesRow().innerText(), /部分发货/);
      await page.screenshot({ path: `${artifacts}/sales-partial-${size}.png`, fullPage: true });

      const facts = await api(`/api/v1/inventory/availability?warehouseId=${warehouse.id}&productIds=${productIds[0]}`);
      await stock(productIds[0], 3, 1, facts[0].factVersion + 1);
      await page.goto(`${base}/?module=inventory&inventory=outbound&sourceOrder=${order.id}`);
      await warehouseRow().getByRole('button', { name: '继续发货', exact: true }).click();
      await shipmentDialog().locator('select').selectOption(warehouse.id);
      await shipmentDialog().getByRole('button', { name: '去发货', exact: true }).waitFor();
      const [secondResponse] = await Promise.all([
        page.waitForResponse(response => /\/outbounds\/[^/]+\/post$/.test(response.url())),
        shipmentDialog().getByRole('button', { name: '去发货', exact: true }).click(),
      ]);
      assert.equal(secondResponse.status(), 200);
      const secondPost = await secondResponse.json();
      assert.equal(secondPost.order.overallStatus, 'SHIPPED');
      assert.equal(secondPost.outbound.id, firstPost.outbound.id);
      assert.equal(secondPost.outbound.lines[0].id, firstPost.outbound.lines[0].id);
      assert.deepEqual(secondPost.order.lines.map(line => line.shippedQty), ['5', '3']);
      assert.deepEqual(secondPost.order.lines.map(line => line.remainingQty), ['0', '0']);
      assert.deepEqual(secondPost.order.lines.map(line => line.activeRequestedQty), ['0', '0']);
      assert.deepEqual(secondPost.order.lines.map(line => line.reservedQty), ['0', '0']);
      await shipmentDialog().waitFor({ state: 'hidden' });
      const finalStock = await checkWarehouseStock([[0, 0, 0], [0, 0, 0]], 'shipped');
      await page.goto(salesUrl);
      await salesRow().getByTitle('查看', { exact: true }).waitFor();
      await salesRow().getByText('已发货', { exact: true }).first().waitFor();
      assert.match(await salesRow().innerText(), /已发货/);
      await page.reload();
      await salesRow().getByTitle('查看', { exact: true }).waitFor();
      await salesRow().getByText('已发货', { exact: true }).first().waitFor();
      assert.match(await salesRow().innerText(), /已发货/);
      assert.equal(await salesRow().getByTitle('去发货', { exact: true }).count(), 0);
      await page.screenshot({ path: `${artifacts}/sales-shipped-${size}.png`, fullPage: true });
      const transactions = await api(`/api/v1/inventory/transactions?sourceId=${secondPost.outbound.id}`);
      assert.equal(transactions.total, 3);
      tasks = await api(`/api/v1/inventory/shipment-tasks?salesOrderId=${order.id}`);
      assert.equal(tasks.items[0].workflowStatus, 'COMPLETED');
      assert.equal(tasks.total, 1);
      await page.goto(`${base}/?module=inventory&inventory=outbound&sourceOrder=${order.id}`);
      await warehouseRow().getByText('已完成', { exact: true }).waitFor();
      assert.equal(await warehouseRow().count(), 1, 'Shipped sales order must have exactly one completed warehouse record');
      await page.reload();
      await warehouseRow().getByText('已完成', { exact: true }).waitFor();
      assert.equal(await warehouseRow().count(), 1, 'Refresh must preserve the original completed outbound');
      await page.screenshot({ path: `${artifacts}/warehouse-completed-${size}.png`, fullPage: true });
      assert.deepEqual(pageErrors, []);
      evidence.push({ viewport, orderId: order.id, orderNo: order.orderNo, taskId: tasks.items[0].id,
        outboundId: secondPost.outbound.id, status: secondPost.order.overallStatus,
        shipped: secondPost.order.lines.map(line => line.shippedQty), transactionCount: transactions.total,
        stockBefore: [[3, 0, 3], [3, 0, 3]], stockPartial: [[1, 1, 0], [0, 0, 0]], finalStock,
        warehouseCode: warehouse.code, warehouseId: warehouse.id, loadingAndRetryVerified: true, pageErrors });
      console.log(`${size}: ${order.orderNo} -> one warehouse task -> partial 2+3 -> total 5+3 -> SHIPPED; 3 stock transactions`);
    } catch (error) {
      await page.screenshot({ path: `${artifacts}/failure-${size}.png`, fullPage: true });
      console.error((await page.locator('body').innerText()).slice(-6500));
      throw error;
    } finally {
      await page.close();
    }
  }
  await writeFile(`${artifacts}/evidence.json`, JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
