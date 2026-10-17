import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Semantic UI regression with controlled business APIs, not database acceptance.
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const snapshot = {
  tenant: { id: 'TENANT-SHWS', code: 'SHWS', name: '接口租户', status: 'running', expireAt: '2099-01-01' },
  capabilities: [], orgUnits: [], resources: [], positions: [], employees: [], accounts: [],
  roles: [], permissions: [], roleGrants: [], adapters: [], approvalRules: [], dictionaries: [], parameters: [], audits: [],
};
const employee = (id, status, department) => ({
  id, employeeNo: id, name: `接口员工${id}`, status, department, position: '接口岗位', phone: '', metadata: {},
});
const customers = [
  { id: 'C1', customerNo: 'C1', name: '接口风险客户', operationStatus: '经营异常', pressureLevel: '高', alerts: [], metadata: {} },
  { id: 'C2', customerNo: 'C2', name: '接口待核验客户', operationStatus: '待核验', pressureLevel: '低', alerts: [], metadata: {} },
];
const suppliers = [
  { id: 'S1', supplierNo: 'S1', name: '接口供应商一', qualification: '附件待上传', metadata: {} },
  { id: 'S2', supplierNo: 'S2', name: '接口供应商二', qualification: '附件临期提醒', metadata: {} },
];
const actionPlan = {
  title: '接口行动方案', description: '来自正式响应', targetModule: 'inventory',
  targetEntity: 'material', targetAction: 'replenish', parameters: { materialId: 'API-M1', qty: '7' },
  impactScope: '接口授权仓库', riskLevel: 'medium',
  dataEvidence: [{ label: '库存事实版本', value: '9' }], approvalPath: '接口审批人',
};
const browser = await chromium.launch({ headless: true });
try {
  for (const mode of ['empty', 'unavailable', 'data', 'missing'].filter(mode => !process.env.FACTS_TEST_MODE || process.env.FACTS_TEST_MODE === mode)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    let rejectChat = true;
    let rejectSubmit = true;
    let sqlMode = 'data';
    const submitted = [];
    await context.addInitScript(() => {
      sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({
        account: 'facts-audit', name: '接口验证员', role: '超级管理员', permissions: ['*'],
        tenantIds: ['TENANT-SHWS', 'TENANT-HDJG'], accessToken: 'controlled-test', expiresAt: '2099-01-01T00:00:00Z',
      }));
    });
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (!path.startsWith('/api/')) return route.fallback();
      const page = items => route.fulfill({ json: { items, total: items.length } });
      if (path.endsWith('/platform/snapshot')) return route.fulfill({ json: snapshot });
      if (path.includes('/workbench/')) return route.fulfill({ status: 503, json: { error: { message: 'CONTROLLED_UNAVAILABLE' } } });
      if (mode === 'unavailable') return route.fulfill({ status: 503, json: { error: { message: 'CONTROLLED_UNAVAILABLE' } } });
      const data = mode === 'data' || mode === 'missing';
      if (path.endsWith('/personnel/employees')) return page(data ? [
        employee('E1', 'active', '接口研发部'), employee('E2', 'resigned', '接口生产部'), employee('E3', 'active', '接口研发部'),
      ] : []);
      if (path.endsWith('/personnel/skills')) return page(data ? [
        { id: 'K1', certNo: 'API-CERT', employeeName: '接口员工E1', skillName: '接口证书', status: '有效', level: '高级', metadata: {} },
      ] : []);
      if (path.endsWith('/supply-chain/suppliers')) return page(data ? suppliers : []);
      if (path.endsWith('/supply-chain/customers')) return page(data ? customers.map(customer =>
        mode === 'missing' ? { ...customer, operationStatus: '', pressureLevel: '' } : customer) : []);
      if (path.endsWith('/supply-chain/risk-events')) return page(data ? [{
        id: 'R1', companyName: '接口风险客户', riskType: '接口风险事件', riskLevel: '高风险', owner: '接口责任人', action: '接口建议',
      }] : []);
      if (path.endsWith('/ai/models')) return route.fulfill({ json: data ? [
        { id: 'M1', name: '接口主模型', modelName: 'api-model', isActive: true, isPrimary: true, temperature: '0', maxTokens: 2048, timeoutSeconds: 17, apiKeyMasked: '***API1' },
        { id: 'M2', name: '接口其他模型', modelName: 'other-model', isActive: true, isPrimary: false, apiKeyMasked: '' },
      ] : [] });
      if (path.endsWith('/ai/dashboard')) return route.fulfill({ json: data ? { totalConversations: 12, pendingActionPlans: 3 } : { totalConversations: 0, pendingActionPlans: 0 } });
      if (path.endsWith('/ai/action-plans')) return page(data ? [{ id: 'P1', title: '接口审计记录', status: 'rejected', submittedBy: '接口提交人', approvalPath: '接口审批路径' }] : []);
      if (path.endsWith('/ai/insights')) return page(data ? [{ id: 'I1', title: '接口聚合预警', summary: 'API 风险摘要', severity: 'warning', sourceType: '接口来源', sourceId: 'API-SOURCE' }] : []);
      if (path.endsWith('/sales/ai-insights')) return route.fulfill({ json: {
        monthlyOrderCount: data ? 5 : 0, totalSalesAmount: data ? '123450' : '0', stalledCount: data ? 2 : 0,
        deliveryRiskCount: data ? 1 : 0, deliveryRiskOrders: data ? [{ orderId: 'API-ORDER-RISK' }] : [], stalledOrders: [],
      } });
      if (path.endsWith('/ai/nl2sql')) {
        if (sqlMode === 'error') return route.fulfill({ status: 503, json: { error: { message: 'SQL_UNAVAILABLE' } } });
        return route.fulfill({ json: { sql: 'SELECT api_value FROM authorized_view', explanation: '接口查询说明',
          ...(sqlMode === 'preview' ? {} : { result: sqlMode === 'data' ? [{ api_value: 'API-RESULT-73' }] : [] }) } });
      }
      if (path.endsWith('/ai/chat')) {
        if (rejectChat) return route.fulfill({ status: 503, json: { error: { message: 'CHAT_UNAVAILABLE' } } });
        return route.fulfill({ json: {
          conversation: { id: 'CONV1' }, assistantMessage: { id: 'MSG1', content: 'API-ASSISTANT-ANSWER' }, actionPlan,
        } });
      }
      if (path.endsWith('/ai/action-plans/submit')) {
        submitted.push(request.postDataJSON());
        if (rejectSubmit) return route.fulfill({ status: 403, json: { error: { message: 'SUBMIT_DENIED' } } });
        return route.fulfill({ json: { actionPlan: { id: 'P1', status: 'submitted' } } });
      }
      if (path.endsWith('/production/readiness')) return route.fulfill({ json: { permissions: ['*'] } });
      if (path.endsWith('/production/work-orders')) return page(data ? [{
        id: 'API-WORK-ID', code: 'API-WORK-CODE', productId: 'API-PRODUCT', plannedQty: '7',
        inputQty: '7', reportedGoodQty: '0', reportedDefectQty: '0', reportedScrapQty: '0',
        postedQty: '0', uom: 'PCS', status: 'PLANNED', dueDate: '2099-01-01', version: 1,
      }] : []);
      if (path.endsWith('/finance/cost-accounting')) return page(data ? [
        { id: 'COST1', docNo: 'API-COST-ONLY', workOrderId: 'API-WORK-ID', materialCost: '123', laborCost: '4', manufacturingCost: '5', totalCost: '132' },
        { id: 'COST2', docNo: 'OTHER-ORDER-COST', workOrderId: 'OTHER-ORDER', materialCost: '9999', totalCost: '9999' },
      ] : []);
      if (path.endsWith('/finance/dashboard')) return route.fulfill({ json: mode === 'missing' ? {} : {
        totalReceivable: data ? '123450' : '0', totalPayable: '0', totalReceived: '0', totalPaid: '0',
        receivableCount: data ? 1 : 0, payableCount: 0, pendingSettlementCount: data ? 1 : 0,
      } });
      const arrayPaths = ['/inventory/availability', '/production/inspections', '/production/completions', '/production/work-order-closes', '/production/bom-snapshots'];
      if (arrayPaths.some(item => path.endsWith(item))) return route.fulfill({ json: [] });
      return page([]);
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const go = async module => { await page.goto(`${baseUrl}/?module=${module}`); await page.waitForLoadState('networkidle'); };
    const metric = async (title, value) => assert.equal(await page.locator(`[data-metric="${title}"] [data-metric-value]`).innerText(), value, `${mode}: ${title}`);
    const clickTab = async name => { await page.getByRole('button', { name, exact: true }).click(); };
    const noCurve = async () => {
      assert(await page.locator('[data-trend]').count() > 0);
      assert.equal(await page.locator('[data-chart-series]').count(), 0);
    };
    const known = mode === 'data' || mode === 'missing';
    const emptyValue = mode === 'unavailable' ? '-' : '0';

    await go('personnel');
    await metric('在职员工总数', known ? '2' : emptyValue);
    await metric('资质证书数', known ? '1' : emptyValue);
    await metric('涉及部门数', known ? '2' : emptyValue);
    assert.equal(await page.locator('[data-ai-card]').count(), 2);
    await noCurve();
    assert.equal(await page.getByRole('button', { name: '考勤与排班', exact: true }).count(), 0);
    await clickTab('员工档案表');
    if (known) {
      await page.getByPlaceholder('搜索工号、姓名、部门...').fill('E2');
      assert.equal(await page.getByRole('cell', { name: '接口员工E2', exact: true }).count(), 1);
      assert.equal(await page.getByRole('cell', { name: '接口员工E1', exact: true }).count(), 0);
    }
    for (const name of ['新增', '导入', '导出']) assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0);
    await clickTab('资质技能');
    if (known) assert.equal(await page.getByText('API-CERT', { exact: true }).count(), 1);
    console.log(`PASS ${mode}: personnel metrics, cards, archive, skills`);

    await go('supply-chain');
    await metric('供应商附件待完善', known ? '1' : emptyValue);
    await metric('附件临期提醒', known ? '1' : emptyValue);
    await metric('客户经营异常', mode === 'missing' ? '-' : known ? '1' : emptyValue);
    await metric('高压应收客户', mode === 'missing' ? '-' : known ? '1' : emptyValue);
    await noCurve();
    await clickTab('供应商信息');
    if (known) assert.equal(await page.getByRole('button', { name: '接口供应商一', exact: true }).count(), 1);
    await clickTab('客户经营');
    if (known) assert.equal(await page.getByText('接口风险客户', { exact: true }).count(), 1);
    await clickTab('风险数据中心');
    assert(!(await page.locator('body').innerText()).includes('33.6'));
    if (known) assert.equal(await page.getByRole('cell', { name: '接口风险事件', exact: true }).count(), 1);
    assert(await page.getByText('尚未获取逾期金额', { exact: true }).count() > 0);
    console.log(`PASS ${mode}: supply dashboard and all subpages`);

    await go('ai-hub');
    if (known) {
      await page.getByText('接口主模型', { exact: true }).first().waitFor();
      const fallbackRow = page.getByText('备用模型', { exact: true }).locator('..');
      assert((await fallbackRow.innerText()).includes('未配置'));
      assert.equal(await page.getByText('***API1', { exact: true }).count(), 1);
    } else {
      assert.equal(await page.getByText('接口主模型', { exact: true }).count(), 0);
      assert(await page.getByText(mode === 'empty' ? '暂无模型配置' : '加载失败').count() > 0);
    }
    await clickTab('AI 数字员工专员');
    await page.getByText('尚未获取数字员工配置', { exact: true }).waitFor();
    await clickTab('审计与监控');
    if (known) {
      assert.equal(await page.getByText('累计对话：12', { exact: true }).count(), 1);
      assert.equal(await page.getByRole('cell', { name: '已驳回', exact: true }).count(), 1);
    }
    console.log(`PASS ${mode}: gateway and audit have only API facts`);

    await go('analytics');
    assert.equal(await page.locator('[data-testid="performance-radar"] polygon[fill="none"]').count(), 3);
    assert.equal(await page.locator('[data-testid="performance-radar"] polygon:not([fill="none"])').count(), 0);
    if (known) await page.getByText('接口聚合预警', { exact: true }).waitFor();
    await clickTab('智能归因树');
    await page.getByText('尚未获取归因链路', { exact: true }).waitFor();
    await clickTab('推演沙盘');
    await page.getByText('尚未获取推演结果与业务基线', { exact: true }).waitFor();
    await clickTab('AI 数据问答 (NL2SQL)');
    if (mode === 'data') {
      for (const state of ['data', 'empty', 'preview', 'error']) {
        sqlMode = state;
        await page.getByLabel('数据分析问题', { exact: true }).fill(`接口问题 ${state}`);
        await page.getByRole('button', { name: '发送数据查询', exact: true }).click();
        await page.getByText(state === 'data' ? 'API-RESULT-73' : state === 'empty' ? '暂无查询结果' : state === 'preview' ? '已返回查询语句，尚未返回执行结果' : '加载失败：SQL_UNAVAILABLE', { exact: true }).waitFor();
        if (state !== 'data') assert.equal(await page.getByText('API-RESULT-73', { exact: true }).count(), 0);
      }
    }
    console.log(`PASS ${mode}: analytics tabs; missing baselines never generate reports`);

    await go('production');
    await clickTab('排产甘特图');
    await page.getByText('尚未获取设备资产与正式排程', { exact: true }).waitFor();
    await clickTab('质量与结案');
    assert.equal(await page.getByText('WO-2026-001', { exact: true }).count(), 0);
    if (known) {
      await page.getByLabel('成本归集工单', { exact: true }).selectOption('API-WORK-ID');
      await page.getByRole('cell', { name: 'API-COST-ONLY', exact: true }).waitFor();
      assert.equal(await page.getByRole('cell', { name: 'OTHER-ORDER-COST', exact: true }).count(), 0);
      assert.equal(await page.getByRole('cell', { name: '¥132.00', exact: true }).count(), 1);
      assert.equal(await page.getByRole('cell', { name: '-', exact: true }).count() >= 2, true);
      await page.getByLabel('成本归集工单', { exact: true }).selectOption('');
      assert.equal(await page.getByRole('cell', { name: 'API-COST-ONLY', exact: true }).count(), 0);
    }
    console.log(`PASS ${mode}: schedule frame and formal work-order cost selection`);

    await go('finance');
    await metric('未结应收 (AR)', mode === 'missing' || mode === 'unavailable' ? '-' : known ? '12.3' : '0.0');
    await metric('未结应付 (AP)', mode === 'missing' || mode === 'unavailable' ? '-' : '0.0');
    console.log(`PASS ${mode}: financial missing values are distinct from confirmed zero`);

    await go('sales');
    await metric('生效报价数', '-');
    await metric('本月订单数', known ? '5' : emptyValue);
    await metric('订单销售额', known ? '12.35' : mode === 'empty' ? '0.00' : '-');
    await noCurve();
    if (mode === 'empty') {
      assert((await page.locator('[data-ai-card="AI 客户资产盘点与激活提示"]').innerText()).includes('暂未发现'));
      assert(!(await page.locator('[data-ai-card="AI 客户资产盘点与激活提示"]').innerText()).includes('推介建议'));
      assert(!(await page.locator('[data-ai-card="订单履约延期预警"]').innerText()).includes('立即发起'));
    }
    if (mode === 'data') {
      await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
      await page.getByLabel('向 AI 助手提问', { exact: true }).fill('查询接口库存');
      await page.getByRole('button', { name: '发送问题', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'CHAT_UNAVAILABLE' }).waitFor();
      assert.equal(await page.getByText('API-ASSISTANT-ANSWER', { exact: true }).count(), 0);
      rejectChat = false;
      await page.getByRole('alert').filter({ hasText: 'CHAT_UNAVAILABLE' }).getByRole('button', { name: '重试', exact: true }).click();
      await page.getByText('API-ASSISTANT-ANSWER', { exact: true }).waitFor();
      await page.getByRole('button', { name: '提交审批', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'SUBMIT_DENIED' }).waitFor();
      assert.equal(await page.getByText('已提交审批，等待授权执行', { exact: true }).count(), 0);
      rejectSubmit = false;
      await page.getByRole('button', { name: '提交审批', exact: true }).click();
      await page.getByText('已提交审批，等待授权执行', { exact: true }).waitFor();
      assert.deepEqual(submitted, [1, 2].map(() => ({ messageId: 'MSG1', conversationId: 'CONV1', actionPlan })));
      await page.getByRole('button', { name: '关闭 AI 助手', exact: true }).click();
      console.log('PASS assistant: failed chat has no fake reply; failed approval retains draft; exact server plan submitted');
    }
    if (mode === 'empty') {
      await go('personnel');
      await page.screenshot({ path: '/tmp/business-facts-personnel-desktop.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: '/tmp/business-facts-personnel-mobile.png', fullPage: true });
    }
    assert.deepEqual(errors, [], `${mode}: browser exceptions`);
    await context.close();
  }
  // A delayed response from tenant A must not restore A's facts after switching to B.
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({
    account: 'scope-audit', name: '租户验证员', role: '超级管理员', permissions: ['*'],
    tenantIds: ['TENANT-SHWS', 'TENANT-HDJG'], accessToken: 'controlled-test', expiresAt: '2099-01-01T00:00:00Z',
  })));
  let releaseOld;
  const oldResponse = new Promise(resolve => { releaseOld = resolve; });
  let oldRequested;
  const oldStarted = new Promise(resolve => { oldRequested = resolve; });
  await context.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return route.fallback();
    if (path.endsWith('/platform/snapshot')) return route.fulfill({ json: snapshot });
    if (path.endsWith('/production/readiness')) return route.fulfill({ json: { permissions: ['*'] } });
    if (path.includes('/workbench/')) return route.fulfill({ status: 503, json: { error: { message: 'CONTROLLED_UNAVAILABLE' } } });
    if (path.endsWith('/personnel/employees')) {
      const old = request.headers()['x-tenant-id'] === 'TENANT-SHWS';
      if (old) { oldRequested(); await oldResponse; }
      const items = old ? [employee('OLD-TENANT', 'active', '旧部门')] : [];
      return route.fulfill({ json: { items, total: items.length } }).catch(() => {});
    }
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/?module=personnel`);
  await oldStarted;
  await page.getByLabel('切换租户', { exact: true }).selectOption('TENANT-HDJG');
  await page.getByRole('button', { name: '人员管理', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-metric="在职员工总数"] [data-metric-value]')?.textContent === '0');
  releaseOld();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('[data-metric="在职员工总数"] [data-metric-value]').innerText(), '0');
  await page.getByRole('button', { name: '员工档案表', exact: true }).click();
  assert.equal(await page.getByText('接口员工OLD-TENANT', { exact: true }).count(), 0);
  await context.close();
  console.log('PASS tenant switch: delayed old-tenant employee responses are discarded');
} finally {
  await browser.close();
}
