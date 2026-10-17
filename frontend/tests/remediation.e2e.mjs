import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// Controlled API integration regressions. These fixtures do not assert database transactions.
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const requests = [];
let effectivePermissions = ['*'];
let registerFails = true;
let messagesFail = false;
let workbenchFails = false;
let payment = null;
let received = '4';
let receipt = null;
let ret = null;
let salesDecision = null;
let salesCanceled = false;
let cancelFails = true;
let aftercareMode = 'data';
const rma = { id: 'rma-db', rmaNo: 'RMA-API-001', orderId: 'stable-so', orderNo: 'SO-API-001', productName: '接口产品', requestedQty: '3', approvedQty: '0', qualifiedQty: null, status: 'REQUESTED', creditNoteFinanceId: 'credit-reference', creditNoteAmount: '-99.00', createdAt: '2026-10-17T00:00:00Z' };
const customerReceipt = { id: 'receipt-db', receiptNo: 'CR-API-001', orderId: 'stable-so', orderNo: 'SO-API-001', customerName: '接口签收客户', lines: [{ outboundLineId: 'OUT-L1', signedQty: '0', rejectedQty: '2', damagedQty: null, uom: 'PCS' }], receiptStatus: 'DISPUTED' };
const platform = {
  tenant: { id: 'TENANT-SHWS', code: 'SHWS', name: '接口企业', status: 'running' },
  roles: [{ id: 'role1', name: '接口角色', code: 'API_ROLE', description: '接口权限测试', status: 'enabled', dataScope: 'tenant', scopeValues: [], version: 7 }],
  permissions: [{ id: 'p-read', name: '销售查看', code: 'sales.order.read', module: '销售管理', type: 'page' }, { id: 'p-create', name: '销售制单', code: 'sales.order.create', module: '销售管理', type: 'button' }],
  roleGrants: [{ roleId: 'role1', permissionId: 'p-read', effect: 'allow' }],
  capabilities: [], orgUnits: [], resources: [], positions: [], employees: [], accounts: [], adapters: [], approvalRules: [], dictionaries: [], parameters: [], audits: [],
};
const order = () => ({ id: 'stable-po', orderNo: 'PO-API-001', purchaseRequestId: 'pr1', demandId: 'd1', materialId: 'm1', warehouseId: 'w1', materialName: '接口物料', orderedQty: '10', receivedQty: received, uom: 'PCS', supplierId: 's1', supplierName: '接口供应商', promisedDate: '2026-10-20', currency: 'CNY', totalAmount: '100', status: received === '10' ? 'RECEIVED' : 'PARTIALLY_RECEIVED', version: received === '4' ? 2 : 3 });
const ar = (id = 'ar1') => ({ id, docNo: `AR-${id}`, customerId: 'c1', customerName: '接口客户', sourceType: 'SALES_ORDER', sourceId: 'so1', sourceDocNo: 'SO-API', currency: 'CNY', totalAmount: '100', receivedAmount: payment?.status === 'done' ? '40' : '0', outstandingAmount: payment?.status === 'done' ? '60' : '100', status: payment?.status === 'done' ? 'processing' : 'pending', version: 1 });
const message = (id = 'msg1') => ({ id, msgNo: id, category: 'order', priority: 'normal', channel: 'in_app', title: `接口销售消息-${id}`, body: '接口消息内容', sourceType: 'SALES_ORDER', sourceId: 'stable-so', sourceDocNo: 'SO-API-001', isRead: false, isArchived: false, senderName: '接口发送人', createdAt: new Date().toISOString(), version: 1 });
let currentMessage = message();
const so = () => ({ id: 'stable-so', orderNo: 'SO-API-001', customerId: 'c1', customerName: '接口客户', ownerEmployeeId: 'maker', warehouseId: 'w1', factoryResourceId: 'f1', totalAmount: '100', currency: 'CNY', overallStatus: salesCanceled ? 'CANCELED' : 'PENDING_CONFIRMATION', reviewStatus: ({ APPROVE: 'APPROVED', RETURN: 'RETURNED', REJECT: 'REJECTED' })[salesDecision] || 'PENDING', confirmationStatus: 'PENDING', version: 2,
  createdAt: '2026-10-17T00:00:00Z', deliveryDate: '2026-10-20', lines: [{ id: 'line1', productId: 'p1', productName: '接口产品', orderedQty: '1', shippedQty: '0', remainingQty: '1', unitPrice: '100', uom: 'PCS' }] });
const envelope = (route, json, status = 200) => route.fulfill({ status, json });
const emptyPage = { items: [], total: 0 };
try {
  await context.addInitScript(() => {
    if (!sessionStorage.getItem('industrial-ai-session:v2')) sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({ account: 'maker', userId: 'maker', name: '前端验证员', role: '超级管理员', permissions: ['*'], tenantIds: ['TENANT-SHWS'], accessToken: 'controlled-test', expiresAt: '2099-01-01T00:00:00Z' }));
  });
  await context.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (!path.startsWith('/api/')) return route.fallback();
    const body = req.postData() ? req.postDataJSON() : null;
    requests.push({ path, query: Object.fromEntries(url.searchParams), method: req.method(), body, key: req.headers()['x-idempotency-key'], version: req.headers()['if-match'] });
    if (path.endsWith('/production/readiness')) return envelope(route, { permissions: effectivePermissions });
    if (['/production/bom-snapshots', '/production/inspections', '/production/completions', '/production/work-order-closes']
      .some(suffix => path.endsWith(suffix))) return envelope(route, []);
    if (path.endsWith('/platform/snapshot')) return envelope(route, platform);
    if (path.endsWith('/platform/roles/role1/grants')) {
      platform.roleGrants = body.grants.map(grant => ({ ...grant, roleId: 'role1' }));
      platform.roles[0].version = platform.roles[0].version === 7 ? 42 : 57;
      return envelope(route, platform.roleGrants);
    }
    if (!effectivePermissions.length && path.includes('/finance/')) return envelope(route, { error: { message: 'PERMISSION_REVOKED' } }, 403);
    if (path.endsWith('/finance/dashboard')) return envelope(route, { totalReceivable: '100', totalPayable: '0', totalReceived: '0', totalPaid: '0', receivableCount: 21, payableCount: 0, pendingSettlementCount: 1 });
    if (path.endsWith('/finance/receivables/ar1')) return envelope(route, ar());
    if (path.endsWith('/finance/receivables')) {
      const page = Number(url.searchParams.get('page') || 1);
      return envelope(route, { items: Array.from({ length: page === 3 ? 1 : 10 }, (_, i) => ar(`ar${(page - 1) * 10 + i + 1}`)), total: 21 });
    }
    if (path.endsWith('/finance/payments') && req.method() === 'POST') {
      if (registerFails) return envelope(route, { error: { message: 'REGISTER_UNAVAILABLE' } }, 503);
      payment = { id: 'pay1', docNo: 'PAY-API-001', ...body, createdBy: 'maker', version: 1, status: 'pending' };
      return envelope(route, { payment });
    }
    if (path.endsWith('/finance/payments/pay1/confirm')) { payment = { ...payment, status: 'done', version: 2 }; return envelope(route, { payment }); }
    if (path.endsWith('/finance/payments')) return envelope(route, { items: payment ? [payment] : [], total: payment ? 1 : 0 });
    if (path.endsWith('/procurement/purchase-orders')) return envelope(route, { items: [order()], total: 1 });
    if (path.endsWith('/procurement/purchase-orders/stable-po/receipts')) {
      received = String(Number(received) + Number(body.receivedQty));
      receipt = { id: 'rcpt1', receiptNo: 'RCPT-API-001', purchaseOrderId: 'stable-po', materialId: 'm1', warehouseId: 'w1', receivedQty: body.receivedQty, uom: 'PCS', status: body.requireInspection ? 'PENDING_INSPECTION' : 'POSTED', version: 1 };
      return envelope(route, { receipt, order: order() });
    }
    if (path.endsWith('/procurement/purchase-receipts/rcpt1/inspect')) { receipt = { ...receipt, status: 'POSTED', inspectionResult: body.result }; return envelope(route, { receipt }); }
    if (path.endsWith('/procurement/purchase-receipts')) return envelope(route, { items: receipt ? [receipt] : [], total: receipt ? 1 : 0 });
    if (path.endsWith('/procurement/purchase-returns') && req.method() === 'POST') { ret = { id: 'ret1', returnNo: 'RET-API-001', ...body, supplierName: '接口供应商', status: 'REQUESTED', version: 1 }; return envelope(route, ret); }
    if (path.endsWith('/procurement/purchase-returns')) return envelope(route, { items: ret ? [ret] : [], total: ret ? 1 : 0 });
    if (path.endsWith('/sales/sales-orders/stable-so/review-decisions')) { salesDecision = body.decision; return envelope(route, so()); }
    if (path.endsWith('/sales/sales-orders/stable-so/cancel')) {
      if (cancelFails) return envelope(route, { error: { message: 'CANCEL_UNAVAILABLE' } }, 503);
      salesCanceled = true;
      return envelope(route, so());
    }
    if (path.endsWith('/sales/sales-orders')) return envelope(route, { items: [so()], total: 1 });
    if (path.endsWith('/fulfillment/rmas') || path.endsWith('/fulfillment/customer-receipts')) {
      if (aftercareMode === 'error') return envelope(route, { error: { message: 'AFTERCARE_UNAVAILABLE' } }, 503);
      if (aftercareMode === 'empty') return envelope(route, emptyPage);
      const record = path.endsWith('/rmas') ? rma : customerReceipt;
      const page = Number(url.searchParams.get('page') || 1);
      if (page === 2) return envelope(route, { items: [{ ...record, id: `${record.id}-2`, rmaNo: 'RMA-API-PAGE2', receiptNo: 'CR-API-PAGE2' }], total: 21 });
      return envelope(route, { items: [record], total: 21 });
    }
    if (path.endsWith('/message/dashboard')) return envelope(route, { unread: currentMessage.isRead ? 0 : 23 });
    if (path.endsWith('/message/messages/msg1/read')) { currentMessage = { ...currentMessage, isRead: true, version: 2 }; return envelope(route, { message: currentMessage }); }
    if (path.endsWith('/message/messages/msg1/archive')) { currentMessage = { ...currentMessage, isArchived: true, version: 3 }; return envelope(route, { message: currentMessage }); }
    if (path.endsWith('/message/messages')) {
      if (messagesFail) return envelope(route, { error: { message: 'MESSAGES_UNAVAILABLE' } }, 503);
      const page = Number(url.searchParams.get('page') || 1);
      const searched = url.searchParams.has('search');
      return envelope(route, { items: currentMessage.isArchived ? [] : page === 1 ? [currentMessage] : [message('msg21')], total: currentMessage.isArchived ? 0 : searched ? 1 : 21 });
    }
    if (path.endsWith('/workbench/dashboard')) {
      if (workbenchFails) return envelope(route, { error: { message: 'WB_UNAVAILABLE' } }, 503);
      return envelope(route, { role: '超级管理员', generatedAt: new Date().toISOString(), dataScope: { tenantId: 'TENANT-SHWS' }, metrics: [{ key: 'apiMetric', title: '接口订单金额', value: '123', unit: 'CNY', definition: '接口事实' }], todos: Array.from({ length: 6 }, (_, i) => ({ module: '销售管理', sourceType: 'SALES_ORDER', sourceId: `so${i}`, title: `接口待办-${i}`, urgent: false })), alerts: [], activities: [], todoTotal: 6, alertTotal: 0 });
    }
    if (path.endsWith('/inventory/availability')) return envelope(route, []);
    if (path.endsWith('/inventory/warehouses')) return envelope(route, { items: [{ id: 'w1', code: 'WH-API', name: '接口仓库' }], total: 1 });
    return envelope(route, emptyPage);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const typeWithStableFocus = async (field, value) => {
    await field.fill('');
    await field.focus();
    await field.press('ControlOrMeta+A');
    const original = await field.elementHandle();
    try {
      for (const character of value) {
        await page.keyboard.insertText(character);
        assert(await original.evaluate(node => node.isConnected && document.activeElement === node),
          `Input remounted or lost focus while typing ${value}`);
      }
      assert.equal(await field.inputValue(), value);
    } finally { await original.dispose(); }
  };
  const go = async query => { await page.goto(`${baseUrl}/?${query}`); await page.waitForLoadState('networkidle'); };
  await go('module=finance&finance=receivable&focusAr=ar1');
  await page.getByRole('button', { name: '收款', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '登记收款', exact: true });
  await dialog.getByLabel('收付款金额', { exact: true }).fill('101');
  await dialog.getByRole('button', { name: '登记待确认' }).click();
  await dialog.getByRole('alert').filter({ hasText: '不能超过' }).waitFor();
  assert.equal(requests.filter(r => r.path.endsWith('/finance/payments') && r.method === 'POST').length, 0);
  await typeWithStableFocus(dialog.getByLabel('收付款金额', { exact: true }), '40');
  await typeWithStableFocus(dialog.getByLabel('备注', { exact: true }), '收款连续输入备注ABC');
  await dialog.getByRole('button', { name: '登记待确认' }).click();
  await dialog.getByRole('alert').filter({ hasText: 'REGISTER_UNAVAILABLE' }).waitFor();
  assert.equal(await dialog.getByLabel('收付款金额', { exact: true }).inputValue(), '40');
  registerFails = false;
  await dialog.getByRole('button', { name: '按原请求重试' }).click();
  await page.getByText('PAY-API-001', { exact: true }).waitFor();
  const registrations = requests.filter(r => r.path.endsWith('/finance/payments') && r.method === 'POST');
  assert.equal(registrations.length, 2);
  assert.equal(registrations[0].key, registrations[1].key);
  assert.equal(registrations[1].body.amount, '40');
  assert.equal(payment.status, 'pending');
  assert.equal(await page.getByRole('button', { name: '确认', exact: true }).isDisabled(), true);
  await page.evaluate(() => { const session = JSON.parse(sessionStorage.getItem('industrial-ai-session:v2')); session.userId = 'checker'; session.account = 'checker'; sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(session)); });
  await page.reload(); await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: '收付款记录', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await page.getByRole('dialog', { name: '确认收付款', exact: true }).getByRole('button', { name: '确认收付款', exact: true }).click();
  await page.getByText('已确认', { exact: true }).waitFor();
  assert.equal(payment.status, 'done');
  console.log('PASS finance: exact partial amount, failed retry key, registration/confirmation separation and maker-checker');

  await go('module=finance&finance=receivable');
  await page.getByText('AR-ar10', { exact: true }).waitFor();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await page.getByText('AR-ar11', { exact: true }).waitFor();
  assert(requests.some(r => r.path.endsWith('/finance/receivables') && r.query.page === '2'));
  console.log('PASS finance pagination: page 2 requests and displays server rows');

  await go('module=procurement&procurement=order&focusPo=stable-po');
  await page.getByRole('button', { name: '送货', exact: true }).click();
  const receive = page.getByRole('dialog', { name: '登记分批收货', exact: true });
  await receive.getByLabel('本次收货数量', { exact: true }).fill('7');
  await typeWithStableFocus(receive.getByLabel('本批送货单号', { exact: true }), 'DELIVERY-ONE');
  await receive.getByRole('button', { name: '登记收货', exact: true }).click();
  await receive.getByRole('alert').filter({ hasText: '不能超过' }).waitFor();
  await receive.getByLabel('本次收货数量', { exact: true }).fill('2');
  await receive.getByRole('button', { name: '登记收货', exact: true }).click();
  await page.getByText('RCPT-API-001', { exact: true }).waitFor();
  assert.equal(receipt.status, 'PENDING_INSPECTION');
  await page.getByRole('button', { name: '质检', exact: true }).click();
  await page.getByRole('dialog', { name: '来料整批质检', exact: true }).getByRole('button', { name: '提交', exact: true }).click();
  await page.getByText('POSTED', { exact: true }).waitFor();
  await page.getByRole('button', { name: '申请退货', exact: true }).click();
  const returnDialog = page.getByRole('dialog', { name: '申请采购退货', exact: true });
  await returnDialog.getByLabel('退货数量', { exact: true }).fill('1');
  await typeWithStableFocus(returnDialog.getByLabel('原因或检验备注', { exact: true }), '接口退货原因');
  await returnDialog.getByRole('button', { name: '提交', exact: true }).click();
  await page.getByRole('button', { name: '采购退货', exact: true }).click();
  await page.getByText('RET-API-001', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '办理退货', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '采购订单(PO)', exact: true }).click();
  await page.getByRole('button', { name: '送货', exact: true }).click();
  await receive.getByLabel('本次收货数量', { exact: true }).fill('4');
  await receive.getByLabel('本批送货单号', { exact: true }).fill('DELIVERY-TWO');
  await receive.getByRole('button', { name: '登记收货', exact: true }).click();
  await page.getByText('RCPT-API-001', { exact: true }).waitFor();
  const batches = requests.filter(r => r.path.endsWith('/purchase-orders/stable-po/receipts'));
  assert.deepEqual(batches.map(r => r.body.receivedQty), ['2', '4']);
  assert.notEqual(batches[0].key, batches[1].key);
  assert.deepEqual(batches.map(r => r.body.externalTransactionId), ['DELIVERY-ONE', 'DELIVERY-TWO']);
  assert.equal(received, '10');
  console.log('PASS procurement: partial receipt remains actionable, quantity bounds, IQC, return approval gate and distinct batches');

  await go('module=messages');
  await typeWithStableFocus(page.getByLabel('搜索消息', { exact: true }), '接口销售');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await page.waitForLoadState('networkidle');
  assert(requests.some(r => r.path.endsWith('/message/messages') && r.query.search === '接口销售'));
  await page.getByRole('button', { name: '查看单据详情', exact: true }).click();
  await page.getByRole('button', { name: '跳转销售管理', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('module') === 'sales' && url.searchParams.get('focusOrder') === 'stable-so');
  await page.getByText('SO-API-001', { exact: true }).first().waitFor();
  assert.equal(new URL(page.url()).searchParams.get('focusOrder'), 'stable-so');
  console.log('PASS message source: stable sales ID reaches sales, not procurement');
  await page.getByRole('button', { name: '订单 SO-API-001 更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '审批 / 复核', exact: true }).click();
  const review = page.getByRole('dialog', { name: '审批 / 复核订单', exact: true });
  await review.getByLabel('复核处理结果', { exact: true }).selectOption('REJECT');
  await review.getByRole('button', { name: '提交复核结果', exact: true }).click();
  await review.getByRole('alert').filter({ hasText: '必须填写原因' }).waitFor();
  assert.equal(salesDecision, null);
  await typeWithStableFocus(review.getByLabel('复核处理意见', { exact: true }), '接口核验拒绝原因');
  await review.getByRole('button', { name: '提交复核结果', exact: true }).click();
  await review.waitFor({ state: 'hidden' });
  assert.equal(salesDecision, 'REJECT');
  assert.equal(requests.find(r => r.path.endsWith('/review-decisions')).body.comment, '接口核验拒绝原因');
  console.log('PASS sales review: reject requires a reason and submits the actual decision');
  await page.getByText('SO-API-001', { exact: true }).first().click();
  await page.getByRole('button', { name: '取消订单', exact: true }).click();
  const cancellation = page.getByRole('dialog', { name: '取消订单', exact: true });
  await cancellation.getByRole('button', { name: '确认取消订单', exact: true }).click();
  await cancellation.getByRole('alert').filter({ hasText: '请填写取消原因' }).waitFor();
  assert.equal(requests.filter(request => request.path.endsWith('/stable-so/cancel')).length, 0);
  await typeWithStableFocus(cancellation.getByLabel('取消原因', { exact: true }), '客户变更采购计划');
  await cancellation.getByRole('button', { name: '确认取消订单', exact: true }).click();
  await cancellation.getByRole('alert').filter({ hasText: 'CANCEL_UNAVAILABLE' }).waitFor();
  assert(await cancellation.getByLabel('取消原因', { exact: true }).isDisabled());
  cancelFails = false;
  await cancellation.getByRole('button', { name: '按原请求重试', exact: true }).click();
  await cancellation.waitFor({ state: 'hidden' });
  const cancellations = requests.filter(request => request.path.endsWith('/stable-so/cancel'));
  assert.equal(cancellations.length, 2);
  assert.equal(cancellations[0].key, cancellations[1].key);
  assert.equal(cancellations[1].body.reason, '客户变更采购计划');
  await page.getByText('已取消', { exact: true }).last().waitFor();
  console.log('PASS sales cancellation: detail entry requires a real reason, failed retry retains input and key');
  await go('module=messages');
  await page.getByText('接口销售消息-msg1', { exact: true }).first().click();
  await page.getByRole('button', { name: '归档', exact: true }).click();
  await page.getByText('暂无符合条件的消息', { exact: true }).waitFor();
  assert(currentMessage.isArchived);
  messagesFail = true;
  await page.getByRole('button', { name: '刷新消息', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'MESSAGES_UNAVAILABLE' }).waitFor();
  assert.equal(await page.getByText('暂无符合条件的消息', { exact: true }).count(), 0);
  messagesFail = false;
  console.log('PASS messages: server search, archive confirmation, errors never appear as successful empty results');

  await go('');
  assert.equal(await page.getByText(/^接口待办-/).count(), 5);
  await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/workbench/dashboard') && new URL(response.url()).searchParams.get('eventScope') === 'ALL'),
    page.getByLabel('业务事件范围', { exact: true }).selectOption('ALL'),
  ]);
  await page.waitForLoadState('networkidle');
  assert(requests.some(r => r.path.endsWith('/workbench/dashboard') && r.query.sections === 'metrics'));
  assert(requests.some(r => r.path.endsWith('/workbench/dashboard') && r.query.sections === 'todos,alerts,activities' && r.query.eventScope === 'ALL'));
  await page.getByRole('button', { name: '快速开单', exact: true }).click();
  await page.getByRole('dialog', { name: '快速创建订单', exact: true }).getByLabel('客户', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('quickCreate'), 'order');
  console.log('PASS workbench: independent queries, 5 todos, event scope, quick-create destination');

  await go('');
  await page.clock.install();
  workbenchFails = true;
  await page.clock.fastForward(301000);
  await page.getByText('数据已过期，业务事项待核对', { exact: true }).waitFor();
  await page.clock.fastForward(1501000);
  await page.getByText('数据已失效，请刷新', { exact: true }).waitFor();
  assert.equal(await page.getByText('123', { exact: true }).count(), 0);
  console.log('PASS workbench expiry: stale warning at 300s, value hidden after 1800s');
  workbenchFails = false;
  await page.clock.resume();

  await go('module=procurement&procurement=receipts');
  await page.setViewportSize({ width: 390, height: 844 });
  await mkdir('/tmp/erp-remediation', { recursive: true });
  await page.screenshot({ path: '/tmp/erp-remediation/procurement-mobile.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!overflow, 'Page should not overflow the mobile viewport');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await go('module=platform&platform=access');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  const roleEditor = page.getByRole('dialog', { name: '新建角色', exact: true });
  // Let the drawer's initial autofocus run before deliberately moving to another field.
  await roleEditor.locator('#editor-name').waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'editor-name');
  await typeWithStableFocus(roleEditor.locator('#editor-name'), '角色连续输入ABC');
  await typeWithStableFocus(roleEditor.locator('#editor-code'), 'FOCUS_ROLE_123');
  await typeWithStableFocus(roleEditor.locator('#editor-description'), '角色说明连续输入');
  await roleEditor.getByRole('button', { name: '暂不保存', exact: true }).click();
  console.log('PASS form focus: finance, procurement, sales, message search and platform drawer preserve input nodes/focus');
  await page.getByRole('radio', { name: '销售制单-拒绝', exact: true }).click();
  await page.getByRole('button', { name: '预览草稿', exact: true }).click();
  await page.getByRole('dialog').getByText('销售制单 (sales.order.create)：未设置 → 拒绝', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭预览', exact: true }).click();
  await page.getByRole('button', { name: '发布变更', exact: true }).click();
  await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/platform/roles/role1/grants')),
    page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/platform/snapshot')),
    page.getByRole('button', { name: '发布权限变更', exact: true }).click(),
  ]);
  await page.waitForLoadState('networkidle');
  await page.getByRole('radio', { name: '销售制单-允许', exact: true }).click();
  await page.getByRole('button', { name: '发布变更', exact: true }).click();
  await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/platform/roles/role1/grants')),
    page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/platform/snapshot')),
    page.getByRole('button', { name: '发布权限变更', exact: true }).click(),
  ]);
  await page.waitForLoadState('networkidle');
  const publications = requests.filter(request => request.path.endsWith('/platform/roles/role1/grants'));
  assert.deepEqual(publications.map(request => request.version), ['"7"', '"42"']);
  assert(requests.filter(request => request.path.endsWith('/production/readiness')).length >= 2);
  console.log('PASS platform grants: real selected role, per-code changes, snapshot version 42 reused and current permissions refreshed');

  const completeRole = { ...platform.roles[0] };
  const publishedCount = publications.length;
  for (const scopeValues of [undefined, null, 'invalid']) {
    platform.roles[0] = { ...completeRole, scopeValues };
    await go('module=platform&platform=access');
    await page.getByText('数据范围待补全', { exact: true }).waitFor();
    await page.getByRole('radio', { name: '销售制单-拒绝', exact: true }).click();
    assert(await page.getByRole('button', { name: '发布变更', exact: true }).isDisabled());
    await page.getByRole('button', { name: '调整范围', exact: true }).click();
    await page.getByRole('dialog', { name: '调整数据范围', exact: true }).waitFor();
    await page.getByRole('button', { name: '暂不保存', exact: true }).click();
  }
  assert.equal(requests.filter(request => request.path.endsWith('/platform/roles/role1/grants')).length, publishedCount);
  platform.roles[0] = completeRole;
  console.log('PASS platform incomplete scope: missing/null/malformed values preserve the page, block publication and keep repair drafts usable');

  for (const [tab, regionName, identifier] of [
    ['rma', '退货记录', 'RMA-API-001'],
    ['receipts', '客户签收记录', 'CR-API-001'],
  ]) {
    aftercareMode = 'data';
    await go(`module=sales&tab=${tab}`);
    const region = page.getByRole('region', { name: regionName, exact: true });
    await region.getByRole('cell', { name: identifier, exact: true }).waitFor();
    if (tab === 'rma') {
      assert(await region.getByRole('button', { name: '创建 RMA', exact: true }).isDisabled());
      const cells = region.getByRole('row').nth(1).getByRole('cell');
      assert.equal(await cells.nth(4).innerText(), '0');
      assert.equal(await cells.nth(6).innerText(), '-');
      assert.equal(await cells.nth(8).innerText(), 'credit-reference');
      assert.equal(await cells.nth(9).innerText(), '-');
    } else {
      await region.getByText('争议中', { exact: true }).waitFor();
      assert.equal(await region.getByRole('row').nth(1).getByRole('cell').nth(3).innerText(), 'OUT-L1：0 PCS');
    }
    await page.screenshot({ path: `/tmp/erp-remediation/${tab}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `/tmp/erp-remediation/${tab}-mobile.png`, fullPage: true });
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${tab}: viewport overflow`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await region.getByRole('button', { name: '下一页', exact: true }).click();
    await region.getByRole('cell', { name: tab === 'rma' ? 'RMA-API-PAGE2' : 'CR-API-PAGE2', exact: true }).waitFor();
    aftercareMode = 'error';
    await region.getByRole('button', { name: `刷新${regionName}`, exact: true }).click();
    await region.getByRole('alert').filter({ hasText: 'AFTERCARE_UNAVAILABLE' }).waitFor();
    assert.equal(await region.getByRole('table').count(), 0);
    assert.equal(await region.getByText(`暂无${regionName}`, { exact: true }).count(), 0);
    aftercareMode = 'empty';
    await region.getByRole('button', { name: '重试', exact: true }).click();
    await region.getByText(`暂无${regionName}`, { exact: true }).waitFor();
    aftercareMode = 'data';
    await region.getByRole('button', { name: `刷新${regionName}`, exact: true }).click();
    await region.getByRole('button', { name: 'SO-API-001', exact: true }).click();
    await page.getByRole('cell', { name: 'SO-API-001', exact: true }).click();
    await page.getByRole('heading', { name: '订单详情', exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('focusOrder'), 'stable-so');
  }
  assert(!requests.some(r => r.path.includes('/fulfillment/') && r.method !== 'GET'));
  console.log('PASS sales aftercare: persisted fields, missing currency, legacy receipt state, pagination, failed/empty/retry states and stable order links without writes');

  salesCanceled = false;
  effectivePermissions = ['sales.order.read'];
  await page.evaluate(() => {
    const session = JSON.parse(sessionStorage.getItem('industrial-ai-session:v2'));
    session.permissions = ['sales.order.read'];
    sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(session));
  });
  await go('module=sales&tab=orders');
  await page.getByText('SO-API-001', { exact: true }).first().click();
  await page.getByRole('heading', { name: '订单详情', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '取消订单', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '去发货', exact: true }).count(), 0);
  const receiptReads = requests.filter(r => r.path.endsWith('/fulfillment/customer-receipts')).length;
  await go('module=sales&tab=receipts');
  await page.getByRole('alert').filter({ hasText: '无客户签收查看权限' }).waitFor();
  assert.equal(requests.filter(r => r.path.endsWith('/fulfillment/customer-receipts')).length, receiptReads);
  assert.equal(await page.getByText('CR-API-001', { exact: true }).count(), 0);
  console.log('PASS sales permissions: read-only access cannot cancel or ship from order details');
  effectivePermissions = ['*'];
  await page.evaluate(() => {
    const session = JSON.parse(sessionStorage.getItem('industrial-ai-session:v2'));
    session.permissions = ['*'];
    sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(session));
  });
  await go('module=finance&finance=payments');
  await page.screenshot({ path: '/tmp/erp-remediation/finance-desktop.png', fullPage: true });

  await go('module=production&production=bom');
  await page.getByRole('button', { name: '发布生效 BOM', exact: true }).click();
  const bomEditor = page.getByRole('dialog', { name: '发布生效 BOM', exact: true });
  await typeWithStableFocus(bomEditor.getByLabel('产品编码', { exact: true }), 'PRODUCT-FOCUS-123');
  await typeWithStableFocus(bomEditor.getByLabel('产品名称', { exact: true }), '生产连续输入ABC');
  await bomEditor.getByRole('button', { name: '添加物料', exact: true }).click();
  await typeWithStableFocus(bomEditor.getByLabel('materialId-0', { exact: true }), 'MATERIAL-FOCUS');
  await typeWithStableFocus(bomEditor.getByLabel('qtyPer-0', { exact: true }), '12.3456');
  await bomEditor.getByRole('button', { name: '添加工序', exact: true }).click();
  await typeWithStableFocus(bomEditor.getByLabel('name-0', { exact: true }), '装配连续输入');
  await bomEditor.getByRole('button', { name: '取消', exact: true }).click();
  assert(!requests.some(request => request.path.endsWith('/production/bom-snapshots') && request.method !== 'GET'));
  console.log('PASS production form focus: product, material, decimal quantity and routing inputs preserve nodes/focus without publishing');

  effectivePermissions = [];
  await page.evaluate(async () => {
    const { listPayments } = await import('/src/api/finance.ts');
    await listPayments({ tenantId: 'TENANT-SHWS', accessToken: 'controlled-test' }).catch(() => {});
  });
  await page.getByRole('heading', { name: '暂无可访问的业务模块', exact: true }).waitFor();
  assert.equal(await page.getByText('PAY-API-001', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS revocation: empty effective permissions removes menus and clears protected UI');
} finally {
  await context.close();
  await browser.close();
}
