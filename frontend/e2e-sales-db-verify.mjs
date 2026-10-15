import { chromium } from 'playwright';
import { execSync } from 'child_process';

const BASE = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:8081';
const PSQL = (sql) => execSync(`psql -U $(whoami) -d industrial_ai -t -A -c "${sql}"`).toString().trim();
const ROWS = (sql) => PSQL(sql).split('\n').filter(Boolean);

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
const loginRes = await fetch(`${API}/api/v1/session/login`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({account:'test01',password:'123456',captchaId:cap.captchaId,captchaCode:code}) });
const login = await loginRes.json();
const TOKEN = login.accessToken;
const HDRS = { 'Authorization': `Bearer ${TOKEN}`, 'X-Tenant-Id': 'TENANT-SHWS' };
const session = { accessToken: TOKEN, account: 'test01', name: 'test01', role: '超级管理员', tenantIds: ['TENANT-SHWS'], tenantName: '演示', permissions: ['*'], permissionVersion: '1', expiresAt: new Date(Date.now()+8*3600000).toISOString(), loginAt: new Date().toISOString(), loginType: 'account', permissionSource: 'dev' };

const results = [];
function chain(name, dbData, apiData, uiText) {
  const apiStr = JSON.stringify(apiData);
  const inApi = dbData.filter(d => apiStr.includes(d));
  const inUi = dbData.filter(d => uiText.includes(d));
  results.push({
    name,
    db: `${dbData.length}条: [${dbData.slice(0,3).join(', ')}]`,
    api: `${inApi.length}/${dbData.length} 一致`,
    ui: `${inUi.length}/${dbData.length} 一致`,
    pass: inApi.length === dbData.length,
    uiPass: inUi.length === dbData.length
  });
}

// ===== 1. 销售订单 DB→API→UI =====
console.log('\n===== 1. 销售订单 =====');
const dbOrderNos = ROWS("SELECT data->>'orderNo' FROM module_document WHERE module='fulfillment' AND kind='order'");
const orderApiRes = await fetch(`${API}/api/v1/sales/sales-orders?page=1&pageSize=50`, { headers: HDRS });
const orderApiData = await orderApiRes.json();
const apiOrderNos = (orderApiData.items || []).map(o => o.orderNo);

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.evaluate(s => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(s)), session);
await page.goto(`${BASE}/?module=sales`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const ordersBtn = await page.$('button:has-text("销售订单")');
if (ordersBtn) { await ordersBtn.click(); await page.waitForTimeout(3000); }
const ordersUiText = await page.evaluate(() => document.body.innerText);

chain('销售订单编号', dbOrderNos, apiOrderNos, ordersUiText);
console.log(`DB:  ${dbOrderNos.join(', ')}`);
console.log(`API: ${apiOrderNos.join(', ')}`);
console.log(`UI包含SO-: ${ordersUiText.includes('SO-')}`);
console.log(`UI全文SO匹配: ${ordersUiText.match(/SO-[A-Z0-9-]+/g)?.join(', ') || 'NONE'}`);

// ===== 2. 仓库 DB→API→UI =====
console.log('\n===== 2. 仓库 =====');
const dbWhNames = ROWS("SELECT data->>'name' FROM module_document WHERE module='fulfillment' AND kind='warehouse'");
const whApiRes = await fetch(`${API}/api/v1/inventory/warehouses`, { headers: HDRS });
const whApiData = await whApiRes.json();
const apiWhNames = (whApiData.items || []).map(w => w.name);
const invUiText = await page.evaluate(() => { window.location.search = '?module=inventory'; return document.body.innerText; });
await page.goto(`${BASE}/?module=inventory`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const invUiText2 = await page.evaluate(() => document.body.innerText);
chain('仓库名称', dbWhNames, apiWhNames, invUiText2);
console.log(`DB:  ${dbWhNames.join(', ')}`);
console.log(`API: ${apiWhNames.join(', ')}`);
console.log(`UI:  ${dbWhNames.filter(n => invUiText2.includes(n)).join(', ')} (${dbWhNames.filter(n => invUiText2.includes(n)).length}/${dbWhNames.length})`);

// ===== 3. 应收 DB→API→UI =====
console.log('\n===== 3. 应收账款 =====');
const dbArTitles = ROWS("SELECT data->>'title' FROM module_document WHERE module='finance' AND kind='receivable'");
const arApiRes = await fetch(`${API}/api/v1/finance/receivables?page=1&pageSize=50`, { headers: HDRS });
const arApiData = await arApiRes.json();
const apiArTitles = (arApiData.items || []).map(r => r.title);
await page.goto(`${BASE}/?module=finance`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const finUiText = await page.evaluate(() => document.body.innerText);
chain('应收标题', dbArTitles, apiArTitles, finUiText);
console.log(`DB:  ${dbArTitles.join(', ')}`);
console.log(`API: ${apiArTitles.join(', ')}`);
console.log(`UI:  ${dbArTitles.filter(t => finUiText.includes(t)).join(', ')} (${dbArTitles.filter(t => finUiText.includes(t)).length}/${dbArTitles.length})`);

// ===== 4. 客户 DB→API→UI =====
console.log('\n===== 4. 客户 =====');
const dbCustNames = ROWS("SELECT data->>'name' FROM module_document WHERE module='supplychain' AND kind='customer'");
const custApiRes = await fetch(`${API}/api/v1/supply-chain/customers?page=1&pageSize=50`, { headers: HDRS });
const custApiData = await custApiRes.json();
const apiCustNames = (custApiData.items || []).map(c => c.name);
await page.goto(`${BASE}/?module=sales`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const custBtn = await page.$('button:has-text("客户管理")');
if (custBtn) { await custBtn.click(); await page.waitForTimeout(3000); }
const custUiText = await page.evaluate(() => document.body.innerText);
chain('客户名称', dbCustNames, apiCustNames, custUiText);
console.log(`DB:  ${dbCustNames.join(', ')}`);
console.log(`API: ${apiCustNames.join(', ')}`);
console.log(`UI:  ${dbCustNames.filter(n => custUiText.includes(n)).join(', ')} (${dbCustNames.filter(n => custUiText.includes(n)).length}/${dbCustNames.length})`);

// ===== FINAL REPORT =====
console.log('\n================================================');
console.log('  销售管理 端到端验证: PostgreSQL → API → UI');
console.log('================================================');
let pass = 0, fail = 0, uiPass = 0, uiFail = 0;
results.forEach(r => {
  const apiIcon = r.pass ? '✅' : '❌';
  const uiIcon = r.uiPass ? '✅' : '⚠️';
  r.pass ? pass++ : fail++;
  r.uiPass ? uiPass++ : uiFail++;
  console.log(`\n${apiIcon} API ${r.name}: DB ${r.db} → API ${r.api}`);
  console.log(`  ${uiIcon} UI  ${r.name}: UI ${r.ui}`);
});
console.log(`\n====== API 层: ${pass}/${results.length} 通过 ======`);
console.log(`====== UI 层: ${uiPass}/${results.length} 通过 ======`);

console.log('\n====== 销售模块 API 调用汇总 ======');
apiCalls.filter(c => c.url.includes('sales') || c.url.includes('inventory') || c.url.includes('supply-chain') || c.url.includes('finance')).forEach(c => {
  console.log(`[${c.status}] ${c.url} → ${c.body.substring(0, 100)}`);
});

await browser.close();
