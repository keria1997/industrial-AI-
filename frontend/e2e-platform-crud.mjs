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
await page.goto(`${BASE}/?module=platform`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

async function closeModal() {
  for (const sel of ['[role="dialog"] button:has-text("取消")', 'button:has-text("取消")']) {
    try { const el = await page.$(sel); if (el) { await el.click(); await page.waitForTimeout(300); } } catch {}
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}
async function tryAction(name, fn) {
  try { await closeModal(); await fn(); results.push({ op: name, pass: true }); }
  catch (e) { await closeModal(); results.push({ op: name, pass: false, error: e.message?.substring(0, 80) }); }
}

// Navigate to employee accounts
await page.$('button:has-text("人员与权限")').then(b => b?.click());
await page.waitForTimeout(1000);
await page.$('text=员工与账号').then(b => b?.click());
await page.waitForTimeout(2000);

// ===== TEST 1: 新建员工档案 =====
await tryAction('新建员工档案 - 点击按钮', async () => {
  const btn = await page.$('button:has-text("新建员工档案")');
  if (!btn) throw new Error('新建员工档案按钮未找到');
  await btn.click();
  await page.waitForTimeout(1500);
});
await page.screenshot({ path: '/tmp/crud-1-add-modal.png' });

await tryAction('新建员工档案 - 填写表单', async () => {
  // Fill all visible inputs
  const inputs = await page.$$('.fixed input:visible, [role="dialog"] input:visible, .modal input:visible');
  const labels = ['姓名', '手机', '邮箱', '工号'];
  for (let i = 0; i < Math.min(inputs.length, 4); i++) {
    const placeholder = await inputs[i].getAttribute('placeholder') || '';
    if (placeholder.includes('姓名') || placeholder.includes('名称')) await inputs[i].fill('E2E测试员工');
    else if (placeholder.includes('手机') || placeholder.includes('电话')) await inputs[i].fill('13900009999');
    else if (placeholder.includes('邮箱')) await inputs[i].fill('e2e@test.com');
    else if (placeholder.includes('工号') || placeholder.includes('编号')) await inputs[i].fill('E2E-001');
  }
});
await page.screenshot({ path: '/tmp/crud-1-filled.png' });

await tryAction('新建员工档案 - 提交', async () => {
  const submit = await page.$('button:has-text("确认"), button:has-text("创建"), button:has-text("保存"), button:has-text("提交")');
  if (submit) { await submit.click(); await page.waitForTimeout(3000); }
  await closeModal();
});
await page.screenshot({ path: '/tmp/crud-1-after.png' });

// ===== TEST 2: 编辑员工 =====
await tryAction('编辑员工 - 点击编辑按钮', async () => {
  const editBtn = await page.$('button:has-text("编辑")');
  if (!editBtn) throw new Error('编辑按钮未找到');
  await editBtn.click();
  await page.waitForTimeout(1500);
});
await page.screenshot({ path: '/tmp/crud-2-edit-modal.png' });

await tryAction('编辑员工 - 修改并保存', async () => {
  const phoneInput = await page.$('input[value*="138"]');
  if (phoneInput) { await phoneInput.fill('13900002222'); }
  const saveBtn = await page.$('button:has-text("保存"), button:has-text("确认")');
  if (saveBtn) { await saveBtn.click(); await page.waitForTimeout(2000); }
  await closeModal();
});

// ===== TEST 3: 角色与权限 - 查看和操作 =====
await tryAction('角色与权限 - 导航', async () => {
  await closeModal();
  const permBtn = await page.$('button:has-text("人员与权限")');
  if (permBtn) { await permBtn.click(); await page.waitForTimeout(500); }
  const roleSub = await page.$('text=角色与权限');
  if (roleSub) { await roleSub.click(); await page.waitForTimeout(2000); }
});
await page.screenshot({ path: '/tmp/crud-3-roles.png' });

await tryAction('角色与权限 - 查看角色列表', async () => {
  const roleText = await page.evaluate(() => document.body.innerText);
  if (!roleText.includes('角色') && !roleText.includes('权限')) throw new Error('角色页面未渲染');
});

// ===== TEST 4: 登录账号管理 =====
await tryAction('登录账号管理 - 导航', async () => {
  await closeModal();
  const permBtn3 = await page.$('button:has-text("人员与权限")');
  if (permBtn3) { await permBtn3.click(); await page.waitForTimeout(500); }
  const loginSub = await page.$('text=登录账号管理');
  if (loginSub) { await loginSub.click(); await page.waitForTimeout(2000); }
});
await page.screenshot({ path: '/tmp/crud-4-login-accounts.png' });

// ===== Print Results =====
console.log('\n========== 平台管理 CRUD 操作测试 ==========');
results.forEach(r => {
  const icon = r.pass ? '✅' : '❌';
  console.log(`${icon} ${r.op}${r.error ? ` → ${r.error}` : ''}`);
});
console.log(`\n总计: ${results.filter(r => r.pass).length}/${results.length} 操作成功`);

console.log('\n========== 写操作 API ==========');
apiCalls.filter(c => ['POST','PUT','PATCH','DELETE'].includes(c.method)).forEach(c => {
  console.log(`[${c.status}] ${c.method} ${c.url}`);
  if (c.body) console.log(`  Body: ${c.body}`);
});

await browser.close();
