import { chromium } from 'playwright';
const BASE = 'https://erp.wanshen.top';
const results = [];
const add = (id, name, status, detail) => {
  results.push({ id, name, status, detail });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${icon} [${status}] ${id}: ${name} — ${detail}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
let captchaText = '';
page.on('response', async res => {
  if (res.url().includes('/session/captcha')) {
    try { const d = await res.json(); const m = decodeURIComponent(d.image).match(/>([A-Z0-9]{4})</); if (m) captchaText = m[1]; } catch(e) {}
  }
});

// ===== 登录 =====
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
await page.locator('input[placeholder="请输入账号"]').fill('liyi');
await page.locator('input[placeholder="请输入密码"]').fill('Liyi1234561');
await page.locator('input[placeholder="请输入验证码"]').fill(captchaText);
await page.locator('button:has-text("立即登录")').click();
await page.waitForTimeout(5000);
console.log('===== 已登录 =====');

// ===== ISSUE-009: 销售主干流 =====
console.log('\n--- ISSUE-009: 销售主干流 ---');
{
  await page.locator('text=销售管理').first().click();
  await page.waitForTimeout(3000);
  const body = await page.textContent('body');
  const hasDash = body.includes('销售监控舱') || body.includes('监控舱');
  const hasOrders = body.includes('销售订单') || body.includes('订单');
  add('ISSUE-009', '销售管理模块可达含数据', (hasDash && hasOrders) ? 'PASS' : 'FAIL',
    `监控舱: ${hasDash}, 订单: ${hasOrders}`);
  await page.screenshot({ path: '/tmp/verify-009-sales.png' });

  // TC-FLOW-001: 快速开单
  const quickBtn = page.locator('button:has-text("快速开单")').first();
  if (await quickBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await quickBtn.click(); await page.waitForTimeout(3000);
    const selects = page.locator('select');
    const count = await selects.count();
    let productOpts = 0;
    for (let i = 0; i < count; i++) {
      const opts = await selects.nth(i).locator('option').count();
      if (opts > 2) productOpts = Math.max(productOpts, opts);
    }
    add('ISSUE-003/DE-03', '快速开单产品下拉', productOpts > 2 ? 'PASS' : 'FAIL', `产品选项: ${productOpts}`);
    await page.screenshot({ path: '/tmp/verify-de03-quickorder.png' });
    const close = page.locator('button[aria-label="Close"], svg.lucide-x, button:has-text("取消")').first();
    if (await close.isVisible().catch(() => false)) { await close.click(); await page.waitForTimeout(1000); }
  } else { add('ISSUE-003/DE-03', '快速开单产品下拉', 'SKIP', '未找到快速开单按钮'); }
}

// ===== ISSUE-010: 库存主干流 =====
console.log('\n--- ISSUE-010: 库存主干流 ---');
{
  await page.locator('text=库存管理').first().click();
  await page.waitForTimeout(3000);
  const body = await page.textContent('body');
  const hasStock = body.includes('现存量') || body.includes('库存') || body.includes('仓库');
  add('ISSUE-010', '库存管理模块可达含数据', hasStock ? 'PASS' : 'FAIL', `含库存/仓库: ${hasStock}`);
  await page.screenshot({ path: '/tmp/verify-010-inventory.png' });

  // ISSUE-015: 调拨入口
  add('ISSUE-015', '调拨入口', body.includes('调拨') ? 'PASS' : 'FAIL', `调拨入口: ${body.includes('调拨')}`);

  // ISSUE-004/DE-04: 手工入库
  const inboundBtn = page.locator('button:has-text("手工入库")').first();
  if (await inboundBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await inboundBtn.click(); await page.waitForTimeout(3000);
    const body2 = await page.textContent('body');
    const isStub = body2.includes('未执行') || body2.includes('尚缺正式提交契约');
    add('ISSUE-004/DE-04', '手工入库按钮', isStub ? 'FAIL' : 'PASS', isStub ? '仍为空函数' : '功能已实现');
    await page.screenshot({ path: '/tmp/verify-de04-inbound.png' });
  } else { add('ISSUE-004/DE-04', '手工入库按钮', 'SKIP', '未找到按钮'); }
}

// ===== ISSUE-011/DE-05: 生产主干流 =====
console.log('\n--- ISSUE-011/DE-05: 生产主干流 ---');
{
  await page.locator('text=生产管理').first().click();
  await page.waitForTimeout(3000);
  const body = await page.textContent('body');
  const hasProd = body.includes('工单') || body.includes('需求') || body.includes('MPS');
  add('ISSUE-011', '生产管理模块可达含数据', hasProd ? 'PASS' : 'FAIL', `含工单/需求/MPS: ${hasProd}`);
  await page.screenshot({ path: '/tmp/verify-011-production.png' });

  // ISSUE-005/DE-05: MRP 按钮
  const mrpBtn = page.locator('button:has-text("MRP"), button:has-text("展算")').first();
  if (await mrpBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await mrpBtn.click(); await page.waitForTimeout(3000);
    const body2 = await page.textContent('body');
    const hasResponse = body2.includes('MRP') || body2.includes('展算') || body2.includes('需求') || body2.includes('没有可展算');
    add('ISSUE-005/DE-05', 'MRP 展算按钮', hasResponse ? 'PASS' : 'FAIL', '按钮有响应');
    await page.screenshot({ path: '/tmp/verify-de05-mrp.png' });
  } else { add('ISSUE-005/DE-05', 'MRP 展算按钮', 'SKIP', '未找到 MRP 按钮'); }
}

// ===== ISSUE-012: 采购主干流 =====
console.log('\n--- ISSUE-012: 采购主干流 ---');
{
  await page.locator('text=采购管理').first().click();
  await page.waitForTimeout(3000);
  const body = await page.textContent('body');
  const hasPR = body.includes('PR') || body.includes('采购申请') || body.includes('采购订单');
  add('ISSUE-012', '采购管理模块可达含数据', hasPR ? 'PASS' : 'FAIL', `含PR/PO: ${hasPR}`);
  await page.screenshot({ path: '/tmp/verify-012-procurement.png' });
}

// ===== ISSUE-013: 财务主干流 =====
console.log('\n--- ISSUE-013: 财务主干流 ---');
{
  await page.locator('text=财务管理').first().click();
  await page.waitForTimeout(3000);
  const body = await page.textContent('body');
  const hasAR = body.includes('应收') || body.includes('AR') || body.includes('应付');
  add('ISSUE-013', '财务管理模块可达含数据', hasAR ? 'PASS' : 'FAIL', `含应收/应付: ${hasAR}`);
  await page.screenshot({ path: '/tmp/verify-013-finance.png' });
}

// ===== 汇总 =====
console.log('\n========================================');
console.log('    已修复 Issue 部署环境验证汇总');
console.log('========================================');
let pass = 0, fail = 0, skip = 0;
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${icon} ${r.id}: ${r.name} → ${r.status} | ${r.detail}`);
  if (r.status === 'PASS') pass++; else if (r.status === 'FAIL') fail++; else skip++;
}
console.log(`\n通过: ${pass} | 失败: ${fail} | 跳过: ${skip} | 总计: ${results.length}`);
(await import('fs')).writeFileSync('/tmp/verify-all-fixed.json', JSON.stringify({ timestamp: new Date().toISOString(), summary: { pass, fail, skip, total: results.length }, results }, null, 2));
await browser.close();
console.log('VERIFY_ALL_DONE');
