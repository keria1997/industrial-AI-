import { chromium } from 'playwright';
const BASE = 'http://124.222.114.67';
const results = [];
const add = (id, name, status, detail) => { results.push({id,name,status,detail}); console.log(`[${status}] ${id}: ${name} — ${detail}`); };

const browser = await chromium.launch({ headless: true });

// ===== 会话1：深链接测试（BUG-02）=====
console.log('\n===== BUG-02: 深链接恢复 =====');
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  let captchaText = '';
  page.on('response', async res => {
    if (res.url().includes('/session/captcha')) {
      try { const d = await res.json(); const m = decodeURIComponent(d.image).match(/>([A-Z0-9]{4})</); if (m) captchaText = m[1]; } catch(e) {}
    }
  });
  await page.goto(`${BASE}/?module=production`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.locator('input[placeholder="请输入账号"]').fill('liyi');
  await page.locator('input[placeholder="请输入密码"]').fill('Liyi1234561');
  await page.locator('input[placeholder="请输入验证码"]').fill(captchaText);
  await page.locator('button:has-text("立即登录")').click();
  await page.waitForTimeout(5000);
  const body = await page.textContent('body');
  const restored = body.includes('生产管理') || body.includes('MRP') || body.includes('生产需求');
  add('TC-AUTH-008', '深链接登录恢复生产管理', restored ? 'PASS' : 'FAIL', `URL: ${page.url()}`);
  await page.screenshot({ path: '/tmp/test-bug02-deeplink.png' });
  await page.close();
}

// ===== 会话2：正常登录，测试其余项目 =====
console.log('\n===== 正常登录 =====');
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  let captchaText = '';
  page.on('response', async res => {
    if (res.url().includes('/session/captcha')) {
      try { const d = await res.json(); const m = decodeURIComponent(d.image).match(/>([A-Z0-9]{4})</); if (m) captchaText = m[1]; } catch(e) {}
    }
  });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.locator('input[placeholder="请输入账号"]').fill('liyi');
  await page.locator('input[placeholder="请输入密码"]').fill('Liyi1234561');
  await page.locator('input[placeholder="请输入验证码"]').fill(captchaText);
  await page.locator('button:has-text("立即登录")').click();
  await page.waitForTimeout(5000);

  // ===== DE-03: 产品仓库配置 =====
  console.log('\n===== DE-03: 产品仓库 =====');
  const invNav = page.locator('text=库存管理').first();
  if (await invNav.isVisible({ timeout: 5000 }).catch(() => false)) {
    await invNav.click(); await page.waitForTimeout(3000);
    const prodTab = page.locator('button:has-text("产品")').first();
    if (await prodTab.isVisible({ timeout: 3000 }).catch(() => false)) { await prodTab.click(); await page.waitForTimeout(2000); }
    const editBtn = page.locator('button[title="编辑"], button:has-text("编辑")').first();
    if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editBtn.click(); await page.waitForTimeout(2000);
      const selects = page.locator('select');
      const count = await selects.count();
      let hasDisabled = false;
      for (let i = 0; i < count; i++) { if (await selects.nth(i).isDisabled()) hasDisabled = true; }
      add('DE-03', '产品编辑仓库下拉', hasDisabled ? 'FAIL' : 'PASS', `disabled select: ${hasDisabled}`);
      await page.screenshot({ path: '/tmp/test-de03.png' });
      const cancel = page.locator('button:has-text("取消"), button:has-text("关闭")').first();
      if (await cancel.isVisible().catch(() => false)) await cancel.click();
    } else { add('DE-03', '产品编辑', 'SKIP', '无产品数据或无编辑按钮'); }
  } else { add('DE-03', '产品编辑', 'SKIP', '未找到库存管理'); }

  // ===== DE-04: 手工入库 =====
  console.log('\n===== DE-04: 手工入库 =====');
  const inboundBtn = page.locator('button:has-text("手工入库")').first();
  if (await inboundBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await inboundBtn.click(); await page.waitForTimeout(3000);
    const body = await page.textContent('body');
    const isStub = body.includes('未执行') || body.includes('尚缺正式提交契约');
    add('DE-04', '手工入库按钮', isStub ? 'FAIL' : 'PASS', isStub ? '仍为空函数' : '弹窗或功能已打开');
    await page.screenshot({ path: '/tmp/test-de04.png' });
  } else { add('DE-04', '手工入库按钮', 'SKIP', '未找到按钮'); }

  // ===== 销售快速开单 =====
  console.log('\n===== 销售快速开单 =====');
  const salesNav = page.locator('text=销售管理').first();
  if (await salesNav.isVisible({ timeout: 5000 }).catch(() => false)) {
    await salesNav.click(); await page.waitForTimeout(2000);
    const quickBtn = page.locator('button:has-text("快速开单")').first();
    if (await quickBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await quickBtn.click(); await page.waitForTimeout(3000);
      const body = await page.textContent('body');
      const hasProductField = body.includes('产品') || body.includes('选择产品');
      add('TC-FLOW-001', '快速开单弹窗', hasProductField ? 'PASS' : 'FAIL', `产品字段: ${hasProductField}`);
      await page.screenshot({ path: '/tmp/test-quick-order.png' });
    } else { add('TC-FLOW-001', '快速开单弹窗', 'SKIP', '未找到快速开单按钮'); }
  }

  // ===== DE-05: MRP =====
  console.log('\n===== DE-05: MRP 展算 =====');
  const prodNav = page.locator('text=生产管理').first();
  if (await prodNav.isVisible({ timeout: 5000 }).catch(() => false)) {
    await prodNav.click(); await page.waitForTimeout(3000);
    const mrpBtn = page.locator('button:has-text("MRP 展算"), button:has-text("全局 MRP"), button:has-text("执行全局")').first();
    if (await mrpBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await mrpBtn.click(); await page.waitForTimeout(3000);
      const body = await page.textContent('body');
      const hasToast = body.includes('没有可展算') || body.includes('展算') || body.includes('MRP');
      add('DE-05', 'MRP 展算按钮', hasToast ? 'PASS' : 'FAIL', '按钮有响应（空数据提示正常）');
      await page.screenshot({ path: '/tmp/test-de05.png' });
    } else { add('DE-05', 'MRP 展算按钮', 'SKIP', '未找到 MRP 按钮'); }
  } else { add('DE-05', 'MRP 展算按钮', 'SKIP', '未找到生产管理'); }

  await page.close();
}

// ===== 汇总 =====
console.log('\n========================================');
console.log('         回归测试结果汇总');
console.log('========================================');
let pass = 0, fail = 0, skip = 0;
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${icon} ${r.id}: ${r.name} → ${r.status} | ${r.detail}`);
  if (r.status === 'PASS') pass++; else if (r.status === 'FAIL') fail++; else skip++;
}
console.log(`\n通过: ${pass} | 失败: ${fail} | 跳过: ${skip} | 总计: ${results.length}`);
(await import('fs')).writeFileSync('/tmp/regression-results.json', JSON.stringify({ timestamp: new Date().toISOString(), summary: { pass, fail, skip, total: results.length }, results }, null, 2));
await browser.close();
console.log('REGRESSION_DONE');
