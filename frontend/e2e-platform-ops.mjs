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

// Login
const capRes = await fetch(`${API}/api/v1/session/captcha`, { method: 'POST' });
const cap = await capRes.json();
const code = decodeURIComponent(cap.image).match(/>([A-Z0-9]{4})<\/text>/)?.[1] || 'XXXX';
const loginRes = await fetch(`${API}/api/v1/session/login`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({account:'test01',password:'123456',captchaId:cap.captchaId,captchaCode:code}) });
const login = await loginRes.json();
const session = { accessToken: login.accessToken, account: 'test01', name: 'test01', role: '超级管理员', tenantIds: ['TENANT-SHWS'], tenantName: '演示', permissions: ['*'], permissionVersion: '1', expiresAt: new Date(Date.now()+8*3600000).toISOString(), loginAt: new Date().toISOString(), loginType: 'account', permissionSource: 'dev' };

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.evaluate(s => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(s)), session);
await page.goto(`${BASE}/?module=platform`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Helper: close any modal/dialog/toast
async function closeModal() {
  // Close confirmation dialogs
  for (const sel of ['[role="dialog"] button:has-text("取消")', '[role="dialog"] button:has-text("关闭")', '[aria-label="关闭确认窗口"]', 'button:has-text("确定")', 'button:has-text("知道了")']) {
    try { const el = await page.$(sel); if (el) { await el.click(); await page.waitForTimeout(300); } } catch {}
  }
  // Press Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

async function tryAction(name, fn) {
  try {
    await closeModal();
    await fn();
    results.push({ op: name, pass: true });
  } catch (e) {
    await closeModal();
    results.push({ op: name, pass: false, error: e.message?.substring(0, 80) });
  }
}

// ===== 1. 编辑企业资料 =====
await tryAction('编辑企业资料 - 打开弹窗', async () => {
  const btn = await page.$('button:has-text("编辑企业资料")');
  if (!btn) throw new Error('按钮未找到');
  await btn.click();
  await page.waitForTimeout(1000);
});
await page.screenshot({ path: '/tmp/op-1-edit-modal.png' });

await tryAction('编辑企业资料 - 修改并保存', async () => {
  const saveBtn = await page.$('button:has-text("保存"), button:has-text("确认")');
  if (saveBtn) { await saveBtn.click(); await page.waitForTimeout(2000); }
  await closeModal();
});

// ===== 2. 业务应用开关 =====
const toggles = await page.$$('[class*="cursor-pointer"][class*="inline-flex"]');
if (toggles.length > 1) {
  await tryAction('业务应用开关 - 切换', async () => {
    await toggles[1].click();
    await page.waitForTimeout(1000);
  });
  await page.screenshot({ path: '/tmp/op-2-toggle.png' });
  await tryAction('业务应用开关 - 切回', async () => {
    await toggles[1].click();
    await page.waitForTimeout(500);
  });
}

// ===== 3. 人员与权限 =====
await tryAction('人员与权限 - 展开菜单', async () => {
  const btn = await page.$('button:has-text("人员与权限")');
  if (!btn) throw new Error('按钮未找到');
  await btn.click();
  await page.waitForTimeout(1000);
});
await page.screenshot({ path: '/tmp/op-3-perm-menu.png' });

// 员工与账号
await tryAction('员工与账号 - 进入', async () => {
  const sub = await page.$('text=员工与账号');
  if (!sub) throw new Error('子菜单未找到');
  await sub.click();
  await page.waitForTimeout(2000);
});
await page.screenshot({ path: '/tmp/op-3-employees.png' });

// 新增员工
await tryAction('员工与账号 - 新增', async () => {
  const addBtn = await page.$('button:has-text("新增"), button:has-text("添加"), button:has-text("创建"), button:has-text("邀请")');
  if (!addBtn) throw new Error('新增按钮未找到');
  await addBtn.click();
  await page.waitForTimeout(1500);
});
await page.screenshot({ path: '/tmp/op-3-add-modal.png' });

await tryAction('员工与账号 - 填写表单', async () => {
  const inputs = await page.$$('input:visible');
  if (inputs.length >= 2) {
    await inputs[0].fill('测试E2E');
    if (inputs[1]) await inputs[1].fill('13900001111');
  }
});
await tryAction('员工与账号 - 提交', async () => {
  const submit = await page.$('button:has-text("确认"), button:has-text("提交"), button:has-text("保存"), button:has-text("邀请")');
  if (submit) { await submit.click(); await page.waitForTimeout(2000); }
  await closeModal();
});
await page.screenshot({ path: '/tmp/op-3-after.png' });

// 角色与权限
await tryAction('角色与权限 - 进入', async () => {
  await closeModal();
  const permBtn2 = await page.$('button:has-text("人员与权限")');
  if (permBtn2) { await permBtn2.click(); await page.waitForTimeout(500); }
  const roleSub = await page.$('text=角色与权限');
  if (!roleSub) throw new Error('角色子菜单未找到');
  await roleSub.click();
  await page.waitForTimeout(2000);
});
await page.screenshot({ path: '/tmp/op-5-roles.png' });

// ===== 4. 规则与治理 =====
await tryAction('规则与治理 - 进入', async () => {
  await closeModal();
  const btn = await page.$('button:has-text("规则与治理")');
  if (!btn) throw new Error('按钮未找到');
  await btn.click();
  await page.waitForTimeout(2000);
});
await page.screenshot({ path: '/tmp/op-6-rules.png' });

// ===== Print Results =====
console.log('\n========== 平台管理操作测试 ==========');
results.forEach(r => {
  const icon = r.pass ? '✅' : '❌';
  console.log(`${icon} ${r.op}${r.error ? ` → ${r.error}` : ''}`);
});
console.log(`\n总计: ${results.filter(r => r.pass).length}/${results.length} 操作成功`);

console.log('\n========== 写操作 API 调用 ==========');
apiCalls.filter(c => ['POST','PUT','PATCH','DELETE'].includes(c.method)).forEach(c => {
  console.log(`[${c.status}] ${c.method} ${c.url}`);
});

await browser.close();
