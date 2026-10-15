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

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.evaluate(s => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(s)), session);

const allResults = [];
let currentApiCalls = [];

page.on('response', async (res) => {
  if (res.url().includes('/api/') && !res.url().includes('.ts') && !res.url().includes('.js')) {
    let body = ''; try { body = await res.text(); } catch {}
    currentApiCalls.push({ url: res.url().replace(/https?:\/\/[^/]+/, ''), status: res.status(), body: body.substring(0, 300) });
  }
});

async function testTab(moduleName, tabText, dbQueries) {
  currentApiCalls = [];
  const handler = async (res) => {
    if (res.url().includes('/api/') && !res.url().includes('.ts') && !res.url().includes('.js')) {
      let body = ''; try { body = await res.text(); } catch {}
      currentApiCalls.push({ url: res.url().replace(/https?:\/\/[^/]+/, ''), status: res.status(), body: body.substring(0, 300) });
    }
  };
  page.on('response', handler);

  const btn = await page.$(`button:has-text("${tabText}")`);
  if (!btn) {
    allResults.push({ module: moduleName, tab: tabText, error: '页签未找到' });
    page.off('response', handler);
    return;
  }
  await btn.click();
  await page.waitForTimeout(3000);

  const uiText = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: `/tmp/tab-${moduleName}-${tabText}.png` });

  const relevantApis = currentApiCalls.filter(c => !c.url.includes('message/messages') && !c.url.includes('workbench'));
  const apiBody = relevantApis.map(c => c.body).join(' ');

  let dbData = [];
  let dbKind = '';
  for (const [kind, query] of Object.entries(dbQueries)) {
    try {
      const rows = ROWS(query);
      if (rows.length > 0) { dbData = rows; dbKind = kind; break; }
    } catch {}
  }

  const dbInApi = dbData.filter(d => apiBody.includes(d));
  const dbInUi = dbData.filter(d => uiText.includes(d));

  allResults.push({
    module: moduleName, tab: tabText,
    apis: relevantApis.map(c => `[${c.status}] ${c.url.split('?')[0]}`),
    dbKind: dbKind || 'N/A',
    dbCount: dbData.length,
    dbSample: dbData.slice(0, 3),
    apiMatch: dbData.length > 0 ? `${dbInApi.length}/${dbData.length}` : 'N/A',
    uiMatch: dbData.length > 0 ? `${dbInUi.length}/${dbData.length}` : 'N/A',
    uiFound: dbData.filter(d => uiText.includes(d)).slice(0, 3),
    source: relevantApis.length > 0 ? 'API' : 'localStorage'
  });
  page.off('response', handler);
}

async function gotoModule(moduleId) {
  await page.goto(`${BASE}/?module=${moduleId}`, { waitUntil: 'networkidle' });
  await page.evaluate(s => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(s)), session);
  await page.goto(`${BASE}/?module=${moduleId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
}

// ============================================================
// 1. 库存管理
// ============================================================
console.log('\n===== 库存管理 =====');
await gotoModule('inventory');
await testTab('库存管理', '库存监控舱', {
  'availability': "SELECT data->>'productId' FROM module_document WHERE module='fulfillment' AND kind='availability'",
  'products': "SELECT data->>'name' FROM module_document WHERE module='fulfillment' AND kind='product'",
});
await testTab('库存管理', '现存量台账', {
  'products': "SELECT data->>'name' FROM module_document WHERE module='fulfillment' AND kind='product'",
  'materials': "SELECT data->>'name' FROM module_document WHERE module='fulfillment' AND kind='material'",
});
await testTab('库存管理', '出库管理', {
  'outbound': "SELECT data->>'outboundNo' FROM module_document WHERE module='fulfillment' AND kind='outbound'",
});
await testTab('库存管理', '入库记录', {
  'receipt': "SELECT data->>'receiptNo' FROM module_document WHERE module='fulfillment' AND kind='receipt'",
});

// ============================================================
// 2. 生产管理
// ============================================================
console.log('\n===== 生产管理 =====');
await gotoModule('production');
await testTab('生产管理', '生产监控舱', {
  'demands': "SELECT data->>'demandNo' FROM module_document WHERE module='fulfillment' AND kind='demand'",
});
await testTab('生产管理', '主计划', {
  'mps': "SELECT data->>'mpsNo' FROM module_document WHERE module='fulfillment' AND kind='mps'",
});
await testTab('生产管理', '订单与齐套', {
  'orders': "SELECT data->>'orderNo' FROM module_document WHERE module='fulfillment' AND kind='order'",
});
await testTab('生产管理', '车间与物流', {
  'jobs': "SELECT data->>'jobNo' FROM module_document WHERE module='fulfillment' AND kind='job'",
});
await testTab('生产管理', '质量与结案', {
  'qc': "SELECT data->>'qcNo' FROM module_document WHERE module='fulfillment' AND kind='qc'",
});

// ============================================================
// 3. 采购管理
// ============================================================
console.log('\n===== 采购管理 =====');
await gotoModule('procurement');
await testTab('采购管理', '采购监控舱', {
  'purchaseRequest': "SELECT data->>'prNo' FROM module_document WHERE module='fulfillment' AND kind='purchaseRequest'",
});
await testTab('采购管理', '采购申请', {
  'purchaseRequest': "SELECT data->>'prNo' FROM module_document WHERE module='fulfillment' AND kind='purchaseRequest'",
});
await testTab('采购管理', '采购订单', {
  'purchaseOrder': "SELECT data->>'poNo' FROM module_document WHERE module='fulfillment' AND kind='purchaseOrder'",
});
await testTab('采购管理', '供应商', {
  'supplier': "SELECT data->>'name' FROM module_document WHERE module='fulfillment' AND kind='supplier'",
});

// ============================================================
// 4. 财务管理
// ============================================================
console.log('\n===== 财务管理 =====');
await gotoModule('finance');
await testTab('财务管理', '财务监控舱', {
  'receivable': "SELECT data->>'title' FROM module_document WHERE module='finance' AND kind='receivable'",
  'payable': "SELECT data->>'title' FROM module_document WHERE module='finance' AND kind='payable'",
});
await testTab('财务管理', '应收账款(AR)', {
  'receivable': "SELECT data->>'title' FROM module_document WHERE module='finance' AND kind='receivable'",
});
await testTab('财务管理', '应付账款(AP)', {
  'payable': "SELECT data->>'title' FROM module_document WHERE module='finance' AND kind='payable'",
});
await testTab('财务管理', '生产成本核算', {
  'cost': "SELECT data->>'costNo' FROM module_document WHERE module='finance' AND kind='cost'",
});

// ============================================================
// FINAL REPORT
// ============================================================
console.log('\n========================================================');
console.log('  全模块 DB → API → UI 完整验证报告');
console.log('========================================================\n');

for (const r of allResults) {
  if (r.error) {
    console.log(`❌ [${r.module}] ${r.tab}: ${r.error}\n`);
    continue;
  }
  console.log(`📋 [${r.module}] ${r.tab}`);
  console.log(`   数据来源: ${r.source}`);
  console.log(`   DB记录: ${r.dbCount} 条 (${r.dbKind}) ${r.dbCount > 0 ? `样本: [${r.dbSample.join(', ')}]` : ''}`);
  console.log(`   API一致: ${r.apiMatch}`);
  console.log(`   UI一致:  ${r.uiMatch} ${r.uiFound.length > 0 ? `可见: [${r.uiFound.join(', ')}]` : ''}`);
  if (r.apis.length > 0) console.log(`   API调用: ${r.apis.map(a => a.split('?')[0]).join(', ')}`);
  console.log('');
}

// Summary table
console.log('\n========== 一致性汇总表 ==========\n');
console.log('| 模块 | 页签 | 数据来源 | DB记录 | API一致 | UI一致 |');
console.log('|---|---|---|---|---|---|');
for (const r of allResults) {
  if (r.error) { console.log(`| ${r.module} | ${r.tab} | - | - | - | ❌ ${r.error} |`); continue; }
  const apiIcon = r.apiMatch !== 'N/A' ? (parseInt(r.apiMatch) > 0 ? '✅' : '⚠️') : '➖';
  const uiIcon = r.uiMatch !== 'N/A' ? (parseInt(r.uiMatch) > 0 ? '✅' : '⚠️') : '➖';
  console.log(`| ${r.module} | ${r.tab} | ${r.source} | ${r.dbCount} | ${apiIcon} ${r.apiMatch} | ${uiIcon} ${r.uiMatch} |`);
}

await browser.close();
