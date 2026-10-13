import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SHIPMENT_E2E_URL || 'http://127.0.0.1:5176';
const artifacts = resolve(process.env.SHIPMENT_SYNC_ARTIFACTS || 'docs/tests/artifacts/shipped-sales-outbound-sync-20261013');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROME_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH } : {}),
});
const evidence = [];
try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const shipmentWrites = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.method() === 'POST' && /\/(shipment-requests|outbounds\/[^/]+\/post)$/.test(request.url())) {
        shipmentWrites.push(request.url());
      }
    });
    try {
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      const captcha = page.locator('img[src^="data:image"]').first();
      await captcha.waitFor();
      const image = await captcha.getAttribute('src');
      const code = decodeURIComponent(image.split(',').slice(1).join(',')).match(/letter-spacing="7">([^<]+)</)?.[1];
      assert.ok(code);
      await page.locator('input').nth(0).fill('test01');
      await page.locator('input').nth(1).fill('123456');
      await page.locator('input').nth(2).fill(code);
      await page.getByRole('button', { name: '立即登录', exact: true }).click();
      await page.getByRole('button', { name: /销售管理/ }).first().waitFor();
      // This local historical order also matches a seed task, exercising source deduplication.
      const orderId = 'SO-20260710-005';
      const salesKey = 'industrial-ai-sales:v8:TENANT-SHWS';
      const outboundKey = 'industrial-ai-inventory-sales-outbound:v1:TENANT-SHWS';
      const order = {
        id: orderId, client: '同步验收客户', salesman: 'test01',
        status: '待发货', outStatus: '未发货', qty: 5, amount: '¥80.00',
        product: 'FG001 工业控制器 × 5 PCS；FG002 传感器 × 3 PCS',
        productName: '工业控制器', productId: 'FG001', unit: 'PCS',
        date: '2026-10-13', deliveryDate: '2026-10-20',
        lines: [
          { productId: 'FG001', productName: '工业控制器', qty: 5, unit: 'PCS' },
          { productId: 'FG002', productName: '传感器', quantity: 3, unit: 'PCS' },
        ],
      };
      await page.evaluate(({ salesKey, order }) => {
        localStorage.setItem(salesKey, JSON.stringify({ schemaVersion: 8, orders: [order] }));
      }, { salesKey, order });
      await page.goto(`${base}/?module=sales&tab=orders&focusOrder=${orderId}`);
      const salesRow = () => page.locator('tbody tr').filter({ hasText: orderId });
      await salesRow().waitFor();
      await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), outboundKey), null);
      await page.addInitScript(({ salesKey, orderId }) => {
        const workspace = JSON.parse(localStorage.getItem(salesKey));
        workspace.orders = workspace.orders.map(order => order.id === orderId
          ? { ...order, status: '已发货', outStatus: '全部发货', shippedAt: '2026-10-13T10:00:00Z' }
          : order);
        localStorage.setItem(salesKey, JSON.stringify(workspace));
      }, { salesKey, orderId });
      await page.reload();
      await salesRow().getByText('已发货', { exact: true }).first().waitFor();
      const tasks = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).tasks, outboundKey);
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].status, '已出库');
      assert.equal(tasks[0].qty, 8);
      await page.evaluate(key => localStorage.removeItem(key), outboundKey);
      const outboundUrl = `${base}/?module=inventory&inventory=outbound&sourceOrder=${orderId}`;
      await page.goto(outboundUrl);
      const outboundRow = () => page.locator('tbody tr').filter({ hasText: orderId });
      await outboundRow().getByText('已完成', { exact: true }).waitFor();
      assert.equal(await outboundRow().count(), 1);
      assert.equal(await outboundRow().getByRole('button', { name: '去发货', exact: true }).count(), 0);
      assert.equal(await outboundRow().getByTitle('下载出库凭证').count(), 1);
      await page.reload();
      await outboundRow().getByText('已完成', { exact: true }).waitFor();
      assert.equal(await outboundRow().count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.getByRole('searchbox').fill(orderId);
      const downloadPromise = page.waitForEvent('download');
      await outboundRow().getByTitle('下载出库凭证').click();
      const download = await downloadPromise;
      assert.equal(await download.failure(), null);
      await page.getByRole('searchbox').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${artifacts}/completed-${viewport.width}x${viewport.height}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      assert.deepEqual(shipmentWrites, [], 'Historical synchronization must not submit another shipment');
      evidence.push({ viewport, orderId, outboundId: tasks[0].id, qty: tasks[0].qty, count: 1, errors });
      console.log(`${viewport.width}x${viewport.height}: shipped order -> one completed outbound; reload and voucher passed`);
    } catch (error) {
      await page.screenshot({ path: `${artifacts}/failure-${viewport.width}x${viewport.height}.png`, fullPage: true });
      throw error;
    } finally {
      await page.close();
    }
  }
  await writeFile(`${artifacts}/evidence.json`, JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
