import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const apiLog = [];
const results = [];
page.on('response', async (res) => {
  if (res.url().includes('/api/') && !res.url().includes('.ts') && !res.url().includes('.js')) {
    let body = ''; try { body = await res.text(); } catch {}
    apiLog.push({ url: res.url().replace(/https?:\/\/[^/]+/, ''), status: res.status(), body: body.substring(0, 300) });
  }
});
const capRes = await fetch('http://127.0.0.1:8081/api/v1/session/captcha', { method: 'POST' });
const cap = await capRes.json();
const code = decodeURIComponent(cap.image).match(/>([A-Z0-9]{4})<\/text>/)?.[1] || 'XXXX';
const loginRes = await fetch('http://127.0.0.1:8081/api/v1/session/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({account:'test01',password:'123456',captchaId:cap.captchaId,captchaCode:code}) });
const login = await loginRes.json();
const session = { accessToken: login.accessToken, account: 'test01', name: 'test01', role: '超级管理员', tenantIds: ['TENANT-SHWS'], tenantName: '演示', permissions: ['*'], permissionVersion: '1', expiresAt: new Date(Date.now()+8*3600000).toISOString(), loginAt: new Date().toISOString(), loginType: 'account', permissionSource: 'dev' };
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.evaluate(s => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(s)), session);

// ===== Personnel Management =====
await page.goto('http://127.0.0.1:5173/?module=personnel', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const pApiStart = apiLog.length;

// Personnel dashboard
await page.screenshot({ path: '/tmp/e2e-p1-dashboard.png' });
const dashText = await page.evaluate(() => document.body.innerText);
const hasEmployeeCount = dashText.includes('在职员工总数');
results.push({ test: '人员管理 → 监控舱加载', pass: hasEmployeeCount, detail: hasEmployeeCount ? '监控舱卡片渲染成功' : '监控舱未渲染' });

// Personnel directory - check for search and filter
const dirBtn = await page.$('button:has-text("员工档案表")');
if (dirBtn) {
  await dirBtn.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-p2-directory.png' });
  const dirText = await page.evaluate(() => document.body.innerText);
  const hasSearch = await page.$('input[placeholder*="搜索"], input[placeholder*="关键词"]');
  const hasStatusFilter = dirText.includes('全部状态');
  const hasDeptFilter = dirText.includes('全部部门');
  const hasTableHeaders = dirText.includes('工号') && dirText.includes('姓名') && dirText.includes('部门');
  const hasNoAddBtn = !dirText.includes('新增') || !dirText.match(/新增/)?.[0];
  results.push({ test: '人员管理 → 员工档案表搜索框', pass: !!hasSearch, detail: hasSearch ? '搜索框存在' : '搜索框缺失' });
  results.push({ test: '人员管理 → 员工档案表状态筛选', pass: hasStatusFilter, detail: hasStatusFilter ? '状态下拉存在' : '缺失' });
  results.push({ test: '人员管理 → 员工档案表部门筛选', pass: hasDeptFilter, detail: hasDeptFilter ? '部门下拉存在' : '缺失' });
  results.push({ test: '人员管理 → 员工档案表表格列', pass: hasTableHeaders, detail: hasTableHeaders ? '工号/姓名/部门列存在' : '列缺失' });
}

// Personnel skills tab
const skillBtn = await page.$('button:has-text("资质技能")');
if (skillBtn) {
  await skillBtn.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-p3-skills.png' });
  const skillText = await page.evaluate(() => document.body.innerText);
  const hasSkillTable = skillText.includes('证书编号') || skillText.includes('资质名称');
  results.push({ test: '人员管理 → 资质技能表格', pass: hasSkillTable, detail: hasSkillTable ? '技能表格存在' : '缺失' });
}

// Verify attendance hidden
const attBtn = await page.$('button:has-text("考勤与排班")');
results.push({ test: '人员管理 → 考勤排班已隐藏', pass: !attBtn, detail: attBtn ? '仍然可见!' : '已隐藏' });

// Verify no add/import/export on directory
const dirBtn2 = await page.$('button:has-text("员工档案表")');
if (dirBtn2) { await dirBtn2.click(); await page.waitForTimeout(1000); }
const dirText2 = await page.evaluate(() => document.body.innerText);
results.push({ test: '人员管理 → 员工档案无新增/导入/导出', pass: !dirText2.includes('新增') && !dirText2.includes('导入') && !dirText2.includes('导出'), detail: '已移除' });

// ===== Platform Management =====
await page.goto('http://127.0.0.1:5173/?module=platform', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-pl1-main.png' });
const platText = await page.evaluate(() => document.body.innerText);

// Check main sections
const hasTenantInfo = platText.includes('企业名称') && platText.includes('上海万申');
const hasAppToggles = platText.includes('销售管理') && platText.includes('已启用');
results.push({ test: '平台管理 → 企业基础信息', pass: hasTenantInfo, detail: hasTenantInfo ? '企业资料展示正常' : '缺失' });
results.push({ test: '平台管理 → 应用开关', pass: hasAppToggles, detail: hasAppToggles ? '业务应用开关展示正常' : '缺失' });

// Click 人员与权限 tab
const permBtn = await page.$('button:has-text("人员与权限")');
if (permBtn) {
  apiLog.length = 0;
  await permBtn.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-pl2-permissions.png' });
  const permText = await page.evaluate(() => document.body.innerText);
  const hasAccounts = permText.includes('账号') || permText.includes('员工') || permText.includes('成员');
  const hasRoles = permText.includes('角色') || permText.includes('权限');
  results.push({ test: '平台管理 → 人员与权限', pass: hasAccounts || hasRoles, detail: `账号:${hasAccounts} 角色:${hasRoles}` });
  const permApis = apiLog.filter(c => c.url.includes('/api/'));
  results.push({ test: '平台管理 → 人员权限API调用', pass: permApis.length > 0, detail: `${permApis.length} 个API被调用` });
} else {
  results.push({ test: '平台管理 → 人员与权限', pass: false, detail: '页签按钮未找到' });
}

// Click 规则与治理 tab
const ruleBtn = await page.$('button:has-text("规则与治理")');
if (ruleBtn) {
  apiLog.length = 0;
  await ruleBtn.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-pl3-rules.png' });
  const ruleText = await page.evaluate(() => document.body.innerText);
  const hasAudit = ruleText.includes('审计') || ruleText.includes('审批') || ruleText.includes('规则');
  results.push({ test: '平台管理 → 规则与治理', pass: hasAudit, detail: hasAudit ? '治理内容展示' : '缺失' });
} else {
  results.push({ test: '平台管理 → 规则与治理', pass: false, detail: '页签按钮未找到' });
}

// ===== Print Results =====
console.log('\n========== E2E TEST RESULTS ==========');
let pass = 0, fail = 0;
results.forEach(r => {
  const icon = r.pass ? '✅' : '❌';
  r.pass ? pass++ : fail++;
  console.log(`${icon} ${r.test}: ${r.detail || r.status}`);
});
console.log(`\nTotal: ${pass} passed, ${fail} failed, ${pass + fail} total`);

console.log('\n========== PERSONNEL API CALLS ==========');
apiLog.filter(c => c.url.includes('personnel')).forEach(c => console.log(`[${c.status}] ${c.url}`));
console.log('\n========== PLATFORM API CALLS ==========');
apiLog.filter(c => c.url.includes('platform')).forEach(c => console.log(`[${c.status}] ${c.url} → ${c.body.substring(0, 150)}`));

await browser.close();
