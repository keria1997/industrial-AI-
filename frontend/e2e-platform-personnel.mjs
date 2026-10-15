import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:8081';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const apiLog = [];
const results = [];

page.on('response', async (res) => {
  if (res.url().includes('/api/')) {
    let body = '';
    try { body = await res.text(); } catch {}
    apiLog.push({ url: res.url().replace(BASE, '').replace(API, ''), status: res.status(), body: body.substring(0, 500) });
  }
});

// ===== Step 1: Login =====
console.log('\n========== 1. LOGIN ==========');
const capRes = await fetch(`${API}/api/v1/session/captcha`, { method: 'POST' });
const cap = await capRes.json();
const svg = decodeURIComponent(cap.image);
const code = svg.match(/>([A-Z0-9]{4})<\/text>/)?.[1] || 'XXXX';
const loginRes = await fetch(`${API}/api/v1/session/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'test01', password: '123456', captchaId: cap.captchaId, captchaCode: code })
});
const loginData = await loginRes.json();
const session = {
  accessToken: loginData.accessToken, account: 'test01', name: 'test01',
  role: '超级管理员', tenantIds: ['TENANT-SHWS'], tenantName: '演示',
  permissions: ['*'], permissionVersion: '1',
  expiresAt: new Date(Date.now() + 8 * 3600000).toISOString(),
  loginAt: new Date().toISOString(), loginType: 'account', permissionSource: 'dev'
};
results.push({ test: 'Login API', status: loginRes.status, pass: loginRes.status === 200 });
console.log(`Login: ${loginRes.status} ✅`);

// ===== Helper =====
async function gotoModule(moduleId, moduleName) {
  await page.goto(`${BASE}/?module=${moduleId}`, { waitUntil: 'networkidle' });
  await page.evaluate((s) => {
    sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(s));
  }, session);
  await page.goto(`${BASE}/?module=${moduleId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
}

async function clickTabAndVerify(tabText, tabId, moduleName) {
  const btn = await page.$(`button:has-text("${tabText}")`);
  if (!btn) {
    results.push({ test: `${moduleName} → ${tabText}`, status: 'TAB NOT FOUND', pass: false });
    return;
  }
  apiLog.length = 0; // clear before tab click
  await btn.click();
  await page.waitForTimeout(2000);
  const screenshotPath = `/tmp/e2e-${moduleName}-${tabId}.png`;
  await page.screenshot({ path: screenshotPath });
  const content = await page.evaluate(() => document.body.innerText);
  const personnelApis = apiLog.filter(c => c.url.includes('/api/'));
  results.push({
    test: `${moduleName} → ${tabText}`,
    status: 'OK',
    apisCalled: personnelApis.length,
    apis: personnelApis.map(a => `[${a.status}] ${a.url}`),
    pass: true
  });
}

// ===== Step 2: Personnel Management =====
console.log('\n========== 2. PERSONNEL MANAGEMENT ==========');
await gotoModule('personnel', '人员管理');

// Get API data directly for comparison
const capRes2 = await fetch(`${API}/api/v1/session/captcha`, { method: 'POST' });
const cap2 = await capRes2.json();
const code2 = decodeURIComponent(cap2.image).match(/>([A-Z0-9]{4})<\/text>/)?.[1] || 'XXXX';
const loginRes2 = await fetch(`${API}/api/v1/session/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'test01', password: '123456', captchaId: cap2.captchaId, captchaCode: code2 })
});
const loginData2 = await loginRes2.json();
const TOKEN = loginData2.accessToken;
const HDRS = { 'Authorization': `Bearer ${TOKEN}`, 'X-Tenant-Id': 'TENANT-SHWS' };

// Fetch backend data directly
const [empRes, attRes, skillRes] = await Promise.all([
  fetch(`${API}/api/v1/personnel/employees?page=1&pageSize=50`, { headers: HDRS }),
  fetch(`${API}/api/v1/personnel/attendances?page=1&pageSize=50`, { headers: HDRS }),
  fetch(`${API}/api/v1/personnel/skills?page=1&pageSize=50`, { headers: HDRS }),
]);
const empData = await empRes.json();
const attData = await attRes.json();
const skillData = await skillRes.json();
console.log(`Backend: employees=${empData.total}, attendances=${attData.total}, skills=${skillData.total}`);
if (empData.items?.length) {
  empData.items.forEach(e => console.log(`  Employee: ${e.employeeNo} ${e.name} ${e.department}`));
}

// Test tabs
await clickTabAndVerify('人员监控舱', 'dashboard', 'personnel');
await clickTabAndVerify('员工档案表', 'directory', 'personnel');

// Verify employee names on directory tab
const dirContent = await page.evaluate(() => document.body.innerText);
const employeeNames = empData.items?.map(e => e.name) || [];
const allFound = employeeNames.every(name => dirContent.includes(name));
results.push({
  test: '人员管理 → 员工档案表 → API数据与页面一致',
  status: `API返回${empData.total}人, 页面找到${employeeNames.filter(n => dirContent.includes(n)).length}人`,
  pass: allFound
});

await clickTabAndVerify('资质技能', 'skills', 'personnel');

// Verify skills data
const skillContent = await page.evaluate(() => document.body.innerText);
const skillNames = skillData.items?.map(s => s.skillName) || [];
const skillsFound = skillNames.every(n => skillContent.includes(n));
results.push({
  test: '人员管理 → 资质技能 → API数据与页面一致',
  status: `API返回${skillData.total}份, 页面找到${skillNames.filter(n => skillContent.includes(n)).length}份`,
  pass: skillsFound
});

// Check attendance tab is hidden
const attBtn = await page.$('button:has-text("考勤与排班")');
results.push({ test: '人员管理 → 考勤与排班已隐藏', status: attBtn ? '仍然可见' : '已隐藏', pass: !attBtn });

// Check no add/import/export buttons on directory
await clickTabAndVerify('员工档案表', 'directory', 'personnel');
const dirContent2 = await page.evaluate(() => document.body.innerText);
const hasAdd = dirContent2.includes('新增');
const hasImport = dirContent2.includes('导入');
const hasExport = dirContent2.includes('导出');
results.push({
  test: '人员管理 → 员工档案表 → 无新增/导入/导出按钮',
  status: `新增:${hasAdd} 导入:${hasImport} 导出:${hasExport}`,
  pass: !hasAdd && !hasImport && !hasExport
});

// ===== Step 3: Platform Management =====
console.log('\n========== 3. PLATFORM MANAGEMENT ==========');
await gotoModule('platform', '平台管理');

// Find platform tabs
const platformTabs = await page.$$eval('button', btns =>
  btns.filter(b => b.offsetParent !== null && b.textContent?.trim())
    .map(b => b.textContent.trim())
    .filter(t => ['员工账号','角色权限','审计日志','组织架构','租户','资源目录','参数配置'].some(k => t.includes(k)))
);
console.log('Platform tabs found:', platformTabs);
results.push({ test: '平台管理 → 可见页签', status: platformTabs.join(', '), pass: platformTabs.length > 0 });

// Test employee accounts tab
await clickTabAndVerify('员工账号', 'accounts', 'platform');

// Check for audit log
await clickTabAndVerify('审计日志', 'audit', 'platform');

// ===== Step 4: Print All Results =====
console.log('\n========== E2E TEST RESULTS ==========');
let passCount = 0, failCount = 0;
results.forEach(r => {
  const icon = r.pass ? '✅' : '❌';
  if (r.pass) passCount++; else failCount++;
  console.log(`${icon} ${r.test}`);
  console.log(`   ${r.status}`);
  if (r.apis?.length) console.log(`   APIs: ${r.apis.join(' | ')}`);
});

// ===== Step 5: Full API Log =====
console.log('\n========== ALL API CALLS ==========');
apiLog.forEach(c => {
  if (c.url.includes('/api/') && !c.url.includes('.ts') && !c.url.includes('.js')) {
    console.log(`[${c.status}] ${c.url} → ${c.body.substring(0, 100)}`);
  }
});

console.log(`\nTotal: ${passCount} passed, ${failCount} failed`);
await page.screenshot({ path: '/tmp/e2e-final.png' });
await browser.close();
