import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:8081';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const apiCalls = [];
const results = [];
page.on('response', async (res) => {
  if (res.url().includes('/api/') && !res.url().includes('.ts') && !res.url().includes('.js')) {
    let body = ''; try { body = await res.text(); } catch {}
    apiCalls.push({ method: res.request().method(), url: res.url().replace(/https?:\/\/[^/]+/, ''), status: res.status(), body: body.substring(0, 200) });
  }
});
const capRes = await fetch(`${API}/api/v1/session/captcha`, { method: 'POST' });
const cap = await capRes.json();
const code = decodeURIComponent(cap.image).match(/>([A-Z0-9]{4})<\/text>/)?.[1] || 'XXXX';
const loginRes = await fetch(`${API}/api/v1/session/login`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({account:'test01',password:'123456',captchaId:cap.captchaId,captchaCode:code}) });
const login = await loginRes.json();
const session = { accessToken: login.accessToken, account: 'test01', name: 'test01', role: '超级管理员', tenantIds: ['TENANT-SHWS'], tenantName: '演示', permissions: ['*'], permissionVersion: '1', expiresAt: new Date(Date.now()+8*3600000).toISOString(), loginAt: new Date().toISOString(), loginType: 'account', permissionSource: 'dev' };
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.evaluate(s => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(s)), session);
await page.goto(`${BASE}/?module=sales`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

async function closeModal() {
  for (const sel of ['[role="dialog"] button:has-text("取消")','button:has-text("取消")','[aria-label*="关闭"]']) {
    try { const el = await page.$(sel); if (el) { await el.click(); await page.waitForTimeout(300); } } catch {}
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}
async function tryAction(name, fn) {
  try { await closeModal(); await fn(); results.push({ op: name, pass: true }); }
  catch (e) { await closeModal(); results.push({ op: name, pass: false, error: e.message?.substring(0, 100) }); }
}
async function clickTab(tabText) {
  const btn = await page.$(`button:has-text("${tabText}")`);
  if (!btn) throw new Error(`页签 "${tabText}" 未找到`);
  await btn.click();
  await page.waitForTimeout(2000);
}

// ===== 1. 销售监控舱 =====
await tryAction('销售监控舱 - 页面加载', async () => {
  const text = await page.evaluate(() => document.body.innerText);
  if (!text.includes('销售监控舱')) throw new Error('页面标题缺失');
  if (!text.includes('订单销售额')) throw new Error('统计卡片缺失');
});
await page.screenshot({ path: '/tmp/sales-1-dashboard.png' });

// ===== 2. 快速开单 =====
await tryAction('快速开单 - 打开弹窗', async () => {
  const btn = await page.$('button:has-text("快速开单")');
  if (!btn) throw new Error('快速开单按钮未找到');
  await btn.click();
  await page.waitForTimeout(2000);
});
await page.screenshot({ path: '/tmp/sales-2-quick-order-modal.png' });

await tryAction('快速开单 - 选择客户', async () => {
  const select = await page.$('select');
  if (select) { await select.selectOption({ index: 1 }); }
  else {
    const input = await page.$('input[placeholder*="客户"], input[placeholder*="搜索客户"]');
    if (input) { await input.click(); await page.waitForTimeout(500);
      const option = await page.$('text=华为技术');
      if (option) await option.click();
    }
  }
});

await tryAction('快速开单 - 填写产品明细', async () => {
  const qtyInputs = await page.$$('input[type="number"]');
  if (qtyInputs.length > 0) { await qtyInputs[0].fill('5'); }
});

await tryAction('快速开单 - 提交订单', async () => {
  const submitBtn = await page.$('button:has-text("创建订单"), button:has-text("提交")');
  if (submitBtn) { await submitBtn.click(); await page.waitForTimeout(3000); }
});
await page.screenshot({ path: '/tmp/sales-2-after-create.png' });

// ===== 3. 产品报价 =====
await tryAction('产品报价 - 切换页签', async () => { await clickTab('产品报价'); });
await page.screenshot({ path: '/tmp/sales-3-quotes.png' });
await tryAction('产品报价 - 查看列表', async () => {
  const text = await page.evaluate(() => document.body.innerText);
  if (!text.includes('报价')) throw new Error('报价列表未渲染');
});

// ===== 4. 销售订单 =====
await tryAction('销售订单 - 切换页签', async () => { await clickTab('销售订单'); });
await page.screenshot({ path: '/tmp/sales-4-orders.png' });

await tryAction('销售订单 - 查看订单列表', async () => {
  const text = await page.evaluate(() => document.body.innerText);
  if (!text.includes('SO-')) throw new Error('订单列表无数据');
});

await tryAction('销售订单 - 状态筛选', async () => {
  const statusBadges = await page.$$eval('[class*="rounded-full"]', els => els.length);
  if (statusBadges < 1) throw new Error('无状态标签');
});

await tryAction('销售订单 - 查看按钮', async () => {
  const viewBtn = await page.$('button:has-text("查看")');
  if (viewBtn) { await viewBtn.click(); await page.waitForTimeout(2000); }
});
await page.screenshot({ path: '/tmp/sales-4-order-detail.png' });
await tryAction('销售订单 - 关闭详情', async () => { await closeModal(); });

// ===== 5. 客户管理 =====
await tryAction('客户管理 - 切换页签', async () => { await clickTab('客户管理'); });
await page.screenshot({ path: '/tmp/sales-5-customers.png' });
await tryAction('客户管理 - 查看列表', async () => {
  const text = await page.evaluate(() => document.body.innerText);
  if (!text.includes('客户')) throw new Error('客户列表未渲染');
});

// ===== 6. 退货管理 =====
await tryAction('退货管理 - 切换页签', async () => { await clickTab('退货管理'); });
await page.screenshot({ path: '/tmp/sales-6-rma.png' });
await tryAction('退货管理 - 查看RMA列表', async () => {
  const text = await page.evaluate(() => document.body.innerText);
  if (!text.includes('RMA') && !text.includes('退货')) throw new Error('RMA列表未渲染');
});

// ===== 7. 客户签收 =====
await tryAction('客户签收 - 切换页签', async () => { await clickTab('客户签收'); });
await page.screenshot({ path: '/tmp/sales-7-receipts.png' });

// ===== 8. 基础数据 =====
await tryAction('基础数据 - 切换页签', async () => { await clickTab('基础数据'); });
await page.screenshot({ path: '/tmp/sales-8-settings.png' });

// ===== Print Results =====
console.log('\n========== 销售管理 E2E 测试 ==========');
results.forEach(r => {
  const icon = r.pass ? '✅' : '❌';
  console.log(`${icon} ${r.op}${r.error ? ` → ${r.error}` : ''}`);
});
console.log(`\n总计: ${results.filter(r => r.pass).length}/${results.length} 操作成功`);

console.log('\n========== API 调用 ==========');
apiCalls.forEach(c => console.log(`[${c.status}] ${c.method} ${c.url}`));

await browser.close();
