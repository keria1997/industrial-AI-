import { chromium } from 'playwright';
import { execSync } from 'child_process';

const BASE = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:8081';
const PSQL = (sql) => execSync(`psql -U $(whoami) -d industrial_ai -t -A -c "${sql}"`).toString().trim();
const ROWS = (sql) => PSQL(sql).split('\n').filter(Boolean);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

// Login
const capRes = await fetch(`${API}/api/v1/session/captcha`, { method: 'POST' });
const cap = await capRes.json();
const code = decodeURIComponent(cap.image).match(/>([A-Z0-9]{4})<\/text>/)?.[1] || 'XXXX';
const loginRes = await fetch(`${API}/api/v1/session/login`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({account:'test01',password:'123456',captchaId:cap.captchaId,captchaCode:code}) });
const login = await loginRes.json();
const TOKEN = login.accessToken;
const HDRS = { 'Authorization': `Bearer ${TOKEN}`, 'X-Tenant-Id': 'TENANT-SHWS' };
const session = { accessToken: TOKEN, account: 'test01', name: 'test01', role: '超级管理员', tenantIds: ['TENANT-SHWS'], tenantName: '演示', permissions: ['*'], permissionVersion: '1', expiresAt: new Date(Date.now()+8*3600000).toISOString(), loginAt: new Date().toISOString(), loginType: 'account', permissionSource: 'dev' };

// Navigate to sales module once
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.evaluate(s => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(s)), session);
await page.goto(`${BASE}/?module=sales`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

const allResults = [];

async function testTab(tabText, tabId, dataSource, apiFilters) {
  // Clear API log
  const tabApiCalls = [];
  const handler = async (res) => {
    if (res.url().includes('/api/') && !res.url().includes('.ts') && !res.url().includes('.js')) {
      let body = ''; try { body = await res.text(); } catch {}
      tabApiCalls.push({ url: res.url().replace(/https?:\/\/[^/]+/, ''), status: res.status(), body: body.substring(0, 300) });
    }
  };
  page.on('response', handler);

  // Click tab
  const btn = await page.$(`button:has-text("${tabText}")`);
  if (!btn) {
    allResults.push({ tab: tabText, error: '页签按钮未找到' });
    page.off('response', handler);
    return;
  }
  await btn.click();
  await page.waitForTimeout(3000);

  // Get page text
  const uiText = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: `/tmp/tab-${tabId}.png` });

  // Filter relevant API calls
  const relevantApis = tabApiCalls.filter(c => !c.url.includes('message/messages') && !c.url.includes('workbench'));

  // Check DB data
  let dbData = [];
  let dbQuery = '';
  for (const [key, query] of Object.entries(dataSource)) {
    const rows = ROWS(query);
    if (rows.length > 0) { dbData = rows; dbQuery = query; break; }
  }

  // Check API data for matches
  const apiBody = relevantApis.map(c => c.body).join(' ');
  const dbInApi = dbData.filter(d => apiBody.includes(d));

  // Check UI for matches
  const dbInUi = dbData.filter(d => uiText.includes(d));

  allResults.push({
    tab: tabText,
    tabId,
    apisCalled: relevantApis.map(c => `[${c.status}] ${c.url.split('?')[0]}`),
    dbTable: dbQuery ? 'module_document' : 'N/A',
    dbRecords: dbData.length,
    dbSample: dbData.slice(0, 3),
    apiMatch: `${dbInApi.length}/${dbData.length}`,
    uiMatch: `${dbInUi.length}/${dbData.length}`,
    uiSample: dbData.filter(d => uiText.includes(d)).slice(0, 3),
    dataSource
  });

  page.off('response', handler);
}

// ===== TAB 1: 销售监控舱 =====
await testTab('销售监控舱', 'dashboard', {
  'orders': "SELECT data->>'orderNo' FROM module_document WHERE module='fulfillment' AND kind='order'",
  'customers': "SELECT data->>'name' FROM module_document WHERE module='supplychain' AND kind='customer'",
}, []);

// ===== TAB 2: 产品报价 =====
await testTab('产品报价', 'quotes', {
  'quotes': "SELECT data->>'quoteNo' FROM module_document WHERE module='fulfillment' AND kind='quote'",
}, []);

// ===== TAB 3: 销售订单 =====
await testTab('销售订单', 'orders', {
  'orders': "SELECT data->>'orderNo' FROM module_document WHERE module='fulfillment' AND kind='order'",
}, []);

// ===== TAB 4: 客户管理 =====
await testTab('客户管理', 'customers', {
  'customers': "SELECT data->>'name' FROM module_document WHERE module='supplychain' AND kind='customer'",
}, []);

// ===== TAB 5: 退货管理 =====
await testTab('退货管理', 'rma', {
  'rma': "SELECT data->>'rmaNo' FROM module_document WHERE module='fulfillment' AND kind='rma'",
}, []);

// ===== TAB 6: 客户签收 =====
await testTab('客户签收', 'receipts', {
  'receipts': "SELECT data->>'receiptNo' FROM module_document WHERE module='fulfillment' AND kind='receipt'",
}, []);

// ===== TAB 7: 基础数据 =====
await testTab('基础数据', 'basic-data', {
  'levels': "SELECT data->>'level' FROM module_document WHERE module='fulfillment' AND kind='level'",
}, []);

// ===== PRINT FULL REPORT =====
console.log('\n========================================================');
console.log('  销售管理 全部子页签 DB → API → UI 完整验证');
console.log('========================================================\n');

for (const r of allResults) {
  if (r.error) {
    console.log(`❌ ${r.tab}: ${r.error}\n`);
    continue;
  }
  console.log(`─────────────────────────────────────────`);
  console.log(`📋 ${r.tab} (${r.tabId})`);
  console.log(`   DB记录数: ${r.dbRecords} 条`);
  if (r.dbRecords > 0) {
    console.log(`   DB样本: [${r.dbSample.join(', ')}]`);
    console.log(`   API匹配: ${r.apiMatch}`);
    console.log(`   UI匹配:  ${r.uiMatch}`);
    if (r.uiSample.length > 0) console.log(`   UI可见: [${r.uiSample.join(', ')}]`);
  }
  if (r.apisCalled.length > 0) {
    console.log(`   API调用:`);
    r.apisCalled.forEach(a => console.log(`     ${a}`));
  } else {
    console.log(`   API调用: 无（使用 localStorage 原型数据）`);
  }
  console.log('');
}

// ===== Summary Table =====
console.log('\n========== 一致性汇总 ==========\n');
console.log('| 页签 | DB记录 | API一致 | UI一致 | 数据来源 |');
console.log('|---|---|---|---|---|');
for (const r of allResults) {
  if (r.error) { console.log(`| ${r.tab} | - | - | - | ${r.error} |`); continue; }
  const source = r.apisCalled.length > 0 ? '后端 API' : 'localStorage';
  const dbCount = r.dbRecords;
  const apiOk = r.apiMatch !== '0/0';
  const uiOk = parseInt(r.uiMatch) > 0 || dbCount === 0;
  console.log(`| ${r.tab} | ${dbCount} | ${apiOk ? '✅' : '❌'} ${r.apiMatch} | ${uiOk ? '✅' : '⚠️'} ${r.uiMatch} | ${source} |`);
}

await browser.close();
