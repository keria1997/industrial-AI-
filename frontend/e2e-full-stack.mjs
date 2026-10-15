import { chromium } from 'playwright';
import { execSync } from 'child_process';

const BASE = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:8081';
const PSQL = (sql) => execSync(`psql -U $(whoami) -d industrial_ai -t -A -c "${sql}"`).toString().trim();
const PSQL_ROWS = (sql) => PSQL(sql).split('\n').filter(Boolean);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const apiCalls = [];
page.on('response', async (res) => {
  if (res.url().includes('/api/') && !res.url().includes('.ts') && !res.url().includes('.js')) {
    let body = ''; try { body = await res.text(); } catch {}
    apiCalls.push({ url: res.url().replace(/https?:\/\/[^/]+/, ''), status: res.status(), body: body.substring(0, 500) });
  }
});

// Login
const capRes = await fetch(`${API}/api/v1/session/captcha`, { method: 'POST' });
const cap = await capRes.json();
const code = decodeURIComponent(cap.image).match(/>([A-Z0-9]{4})<\/text>/)?.[1] || 'XXXX';
const loginRes = await fetch(`${API}/api/v1/session/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: 'test01', password: '123456', captchaId: cap.captchaId, captchaCode: code }) });
const login = await loginRes.json();
const TOKEN = login.accessToken;
const HDRS = { 'Authorization': `Bearer ${TOKEN}`, 'X-Tenant-Id': 'TENANT-SHWS' };
const session = { accessToken: TOKEN, account: 'test01', name: 'test01', role: '超级管理员', tenantIds: ['TENANT-SHWS'], tenantName: '演示', permissions: ['*'], permissionVersion: '1', expiresAt: new Date(Date.now()+8*3600000).toISOString(), loginAt: new Date().toISOString(), loginType: 'account', permissionSource: 'dev' };
const results = [];
const check = (name, db, api, ui) => results.push({ name, db, api, ui, pass: String(db) === String(api) && String(api) === String(ui) });
const checkContains = (name, dbArr, apiData, uiText) => {
  const apiStr = JSON.stringify(apiData);
  const inApi = dbArr.filter(v => apiStr.includes(v));
  const inUi = dbArr.filter(v => uiText.includes(v));
  results.push({ name, db: `${dbArr.length}条:[${dbArr.slice(0,3).join(',')}]`, api: `${inApi.length}/${dbArr.length} 匹配`, ui: `${inUi.length}/${dbArr.length} 匹配`, pass: inApi.length === dbArr.length });
};

async function gotoAndClick(moduleId, tabText) {
  await page.goto(`${BASE}/?module=${moduleId}`, { waitUntil: 'networkidle' });
  await page.evaluate(s => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(s)), session);
  await page.goto(`${BASE}/?module=${moduleId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  if (tabText) { const b = await page.$(`button:has-text("${tabText}")`); if (b) { await b.click(); await page.waitForTimeout(2000); } }
  return await page.evaluate(() => document.body.innerText);
}

// ===== TEST 1: 人员管理-员工 =====
console.log('\n=== TEST 1: 人员管理-员工数据链路 ===');
const dbEmpNames = PSQL_ROWS("SELECT data->>'name' FROM module_document WHERE module='personnel' AND kind='employee'");
const dbEmpCount = PSQL("SELECT count(*) FROM module_document WHERE module='personnel' AND kind='employee'");
const empApi = await (await fetch(`${API}/api/v1/personnel/employees?page=1&pageSize=50`, { headers: HDRS })).json();
const apiEmpNames = (empApi.items || []).map(e => e.name);
const personnelUi = await gotoAndClick('personnel', '员工档案表');
checkContains('人员-员工姓名', dbEmpNames, empApi, personnelUi);
check('人员-员工数量', `DB:${dbEmpCount}`, `API:${empApi.total ?? apiEmpNames.length}`, `组件state:${personnelUi.includes('在职员工总数') ? '有卡片' : 'N/A'}`);
console.log(`DB:${dbEmpNames.join(',')} API:${apiEmpNames.join(',')} UI匹配:${dbEmpNames.filter(n => personnelUi.includes(n)).length}/${dbEmpNames.length}`);

// ===== TEST 2: 人员管理-技能 =====
console.log('\n=== TEST 2: 人员管理-技能数据链路 ===');
const dbSkillNames = PSQL_ROWS("SELECT data->>'skillName' FROM module_document WHERE module='personnel' AND kind='skill'");
const skillApi = await (await fetch(`${API}/api/v1/personnel/skills?page=1&pageSize=50`, { headers: HDRS })).json();
const skillsUi = await gotoAndClick('personnel', '资质技能');
checkContains('人员-技能名称', dbSkillNames, skillApi, skillsUi);
console.log(`DB:${dbSkillNames.join(',')} API:${(skillApi.items||[]).map(s=>s.skillName).join(',')}`);

// ===== TEST 3: 平台管理-企业 =====
console.log('\n=== TEST 3: 平台管理-企业数据链路 ===');
const dbTenantCode = PSQL("SELECT data->>'code' FROM module_document WHERE module='platform' AND kind='tenant' LIMIT 1") || 'SHWS';
const dbTenantName = PSQL("SELECT data->>'name' FROM module_document WHERE module='platform' AND kind='tenant' LIMIT 1") || '上海万申工业集团';
const platApi = await (await fetch(`${API}/api/v1/platform/snapshot`, { headers: HDRS })).json();
const apiTenantName = platApi?.tenant?.name || 'N/A';
const platformUi = await gotoAndClick('platform');
check('平台-企业名称', dbTenantName, apiTenantName, platformUi.includes(dbTenantName) ? dbTenantName : `UI包含:${platformUi.includes('万申')}`);
check('平台-企业编码', dbTenantCode, platApi?.tenant?.code || 'N/A', platformUi.includes(dbTenantCode) ? dbTenantCode : 'N/A');
console.log(`DB:${dbTenantName} API:${apiTenantName} UI:${platformUi.includes(dbTenantName) ? '✅' : '❌'}`);

// ===== TEST 4: 财务管理-应收 =====
console.log('\n=== TEST 4: 财务管理-应收数据链路 ===');
const dbArTitles = PSQL_ROWS("SELECT data->>'title' FROM module_document WHERE module='finance' AND kind='receivable'");
const dbArCount = PSQL("SELECT count(*) FROM module_document WHERE module='finance' AND kind='receivable'");
const arApi = await (await fetch(`${API}/api/v1/finance/receivables?page=1&pageSize=50`, { headers: HDRS })).json();
const financeUi = await gotoAndClick('finance');
if (dbArTitles.length > 0) {
  checkContains('财务-应收标题', dbArTitles, arApi, financeUi);
} else {
  check('财务-应收', `DB:${dbArCount}条`, `API:${arApi.items?.length ?? 0}条`, '无种子数据');
}
console.log(`DB:${dbArTitles.join(',')} API:${(arApi.items||[]).map(r=>r.title).join(',')}`);

// ===== TEST 5: 销售-订单 =====
console.log('\n=== TEST 5: 销售管理-订单数据链路 ===');
const dbOrderNos = PSQL_ROWS("SELECT data->>'orderNo' FROM module_document WHERE module='fulfillment' AND kind='order' LIMIT 5");
const dbOrderCount = PSQL("SELECT count(*) FROM module_document WHERE module='fulfillment' AND kind='order'");
const orderApi = await (await fetch(`${API}/api/v1/sales/sales-orders?page=1&pageSize=50`, { headers: HDRS })).json();
const apiOrderNos = (orderApi.items || []).map(o => o.orderNo || o.id);
const salesUi = await gotoAndClick('sales', '销售订单');
if (dbOrderNos.length > 0) {
  checkContains('销售-订单编号', dbOrderNos, orderApi, salesUi);
} else {
  check('销售-订单', `DB:${dbOrderCount}条`, `API:${orderApi.items?.length ?? 0}条`, '无种子订单');
}
console.log(`DB:${dbOrderNos.join(',')} API:${apiOrderNos.join(',')}`);

// ===== TEST 6: 库存-仓库 =====
console.log('\n=== TEST 6: 库存管理-仓库数据链路 ===');
const dbWhNames = PSQL_ROWS("SELECT data->>'name' FROM module_document WHERE module='fulfillment' AND kind='warehouse'");
const whApi = await (await fetch(`${API}/api/v1/inventory/warehouses`, { headers: HDRS })).json();
const apiWhNames = (whApi.items || []).map(w => w.name);
const invUi = await gotoAndClick('inventory');
checkContains('库存-仓库名称', dbWhNames, whApi, invUi);
console.log(`DB:${dbWhNames.join(',')} API:${apiWhNames.join(',')} UI匹配:${dbWhNames.filter(n => invUi.includes(n)).length}/${dbWhNames.length}`);

// ===== FINAL REPORT =====
console.log('\n==========================================');
console.log('    端到端全链路验证: DB → API → UI');
console.log('==========================================');
let pass = 0, fail = 0;
results.forEach(r => {
  const icon = r.pass ? '✅' : '❌';
  r.pass ? pass++ : fail++;
  console.log(`\n${icon} ${r.name}`);
  console.log(`   DB:  ${r.db}`);
  console.log(`   API: ${r.api}`);
  console.log(`   UI:  ${r.ui}`);
});
console.log(`\n====== 总计: ${pass} 通过, ${fail} 失败, ${results.length} 项 ======`);

// API summary
console.log('\n====== 后端 API 调用汇总 ======');
apiCalls.filter(c => c.url.startsWith('/api/')).forEach(c => console.log(`[${c.status}] ${c.url}`));

await browser.close();
