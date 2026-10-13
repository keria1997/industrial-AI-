-- Traceable baseline documents for the current tenant. Dates are generated at
-- migration time so monthly, today and horizon workbench metrics remain live.
BEGIN;
SET LOCAL app.bootstrap_mode = 'true';
SET LOCAL app.tenant_id = 'TENANT-SHWS';

DO $$
DECLARE
  v_now timestamptz := now();
  v_today date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  v_month text := to_char(v_now, 'YYYY-MM');
BEGIN
  DELETE FROM module_document
  WHERE tenant_id = 'TENANT-SHWS'
    AND doc_id LIKE '%-seed-%'
    AND (module, kind) IN (
      ('finance', 'receivable'), ('finance', 'payable'),
      ('personnel', 'employee'), ('personnel', 'attendance'), ('personnel', 'skill'),
      ('production', 'demand'), ('production', 'workOrder'), ('production', 'inspection'),
      ('fulfillment', 'order'), ('fulfillment', 'availability'), ('fulfillment', 'shipmentTask'),
      ('fulfillment', 'purchaseRequest'), ('fulfillment', 'purchaseOrder'),
      ('fulfillment', 'purchaseReceipt'), ('fulfillment', 'stocktakeTask'),
      ('supplychain', 'supplier'), ('supplychain', 'customer'), ('supplychain', 'riskEvent'),
      ('ai', 'insight'), ('message', 'record')
    );

  INSERT INTO module_document (module, tenant_id, kind, doc_id, data) VALUES
  ('finance', 'TENANT-SHWS', 'receivable', 'ar-seed-001', jsonb_build_object(
    'id', 'ar-seed-001', 'tenantId', 'TENANT-SHWS', 'docNo', 'AR-' || to_char(v_today, 'YYYYMMDD') || '-001',
    'title', '苏州精密装备销售订单', 'customerId', 'cus-001', 'customerName', '苏州精密装备',
    'businessType', 'sales', 'sourceType', 'SalesOrder', 'sourceId', 'so-seed-002', 'sourceDocNo', 'SO-SEED-002',
    'currency', 'CNY', 'totalAmount', '386000', 'receivedAmount', '0', 'outstandingAmount', '386000',
    'status', 'pending', 'dueDate', to_char(v_today + 12, 'YYYY-MM-DD'), 'issuedAt', NULL, 'settledAt', NULL,
    'remark', '本月销售订单应收', 'version', 1, 'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('finance', 'TENANT-SHWS', 'receivable', 'ar-seed-002', jsonb_build_object(
    'id', 'ar-seed-002', 'tenantId', 'TENANT-SHWS', 'docNo', 'AR-' || to_char(v_today, 'YYYYMMDD') || '-002',
    'title', '上海智造客户逾期应收', 'customerId', 'cus-002', 'customerName', '上海智造客户',
    'businessType', 'sales', 'sourceType', 'SalesOrder', 'sourceId', 'so-seed-001', 'sourceDocNo', 'SO-SEED-001',
    'currency', 'CNY', 'totalAmount', '128000', 'receivedAmount', '20000', 'outstandingAmount', '108000',
    'status', 'processing', 'dueDate', to_char(v_today - 2, 'YYYY-MM-DD'), 'issuedAt', NULL, 'settledAt', NULL,
    'remark', '客户承诺本周付款', 'version', 1, 'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('finance', 'TENANT-SHWS', 'payable', 'ap-seed-001', jsonb_build_object(
    'id', 'ap-seed-001', 'tenantId', 'TENANT-SHWS', 'docNo', 'AP-' || to_char(v_today, 'YYYYMMDD') || '-001',
    'title', '电子物料采购应付', 'supplierId', 'sup-001', 'supplierName', '深圳华芯科技',
    'businessType', 'purchase', 'sourceType', 'PurchaseOrder', 'sourceId', 'po-seed-001', 'sourceDocNo', 'PO-SEED-001',
    'currency', 'CNY', 'totalAmount', '154000', 'paidAmount', '0', 'outstandingAmount', '154000',
    'status', 'pending', 'dueDate', to_char(v_today + 8, 'YYYY-MM-DD'), 'issuedAt', NULL, 'settledAt', NULL,
    'remark', '按账期结算', 'version', 1, 'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),

  ('personnel', 'TENANT-SHWS', 'employee', 'emp-seed-001', jsonb_build_object(
    'id', 'emp-seed-001', 'tenantId', 'TENANT-SHWS', 'employeeNo', 'EMP-1001', 'name', '张工',
    'department', '总装车间', 'position', '装配技师', 'phone', '', 'email', '', 'status', 'active',
    'hireDate', '2023-03-01', 'leaveDate', NULL, 'metadata', '{}', 'remark', '', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('personnel', 'TENANT-SHWS', 'employee', 'emp-seed-002', jsonb_build_object(
    'id', 'emp-seed-002', 'tenantId', 'TENANT-SHWS', 'employeeNo', 'EMP-1002', 'name', '李敏',
    'department', '总装车间', 'position', '质检员', 'phone', '', 'email', '', 'status', 'active',
    'hireDate', '2023-03-01', 'leaveDate', NULL, 'metadata', '{}', 'remark', '', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('personnel', 'TENANT-SHWS', 'employee', 'emp-seed-003', jsonb_build_object(
    'id', 'emp-seed-003', 'tenantId', 'TENANT-SHWS', 'employeeNo', 'EMP-1003', 'name', '王强',
    'department', '计划物流部', 'position', '生产计划员', 'phone', '', 'email', '', 'status', 'active',
    'hireDate', '2023-03-01', 'leaveDate', NULL, 'metadata', '{}', 'remark', '', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('personnel', 'TENANT-SHWS', 'attendance', 'att-seed-001', jsonb_build_object(
    'id', 'att-seed-001', 'tenantId', 'TENANT-SHWS', 'recordNo', 'ATT-SEED-001', 'employeeId', 'EMP-1001',
    'employeeName', '张工', 'recordDate', to_char(v_today, 'YYYY-MM-DD'), 'shift', 'day', 'clockIn', '08:01',
    'clockOut', '17:58', 'status', 'normal', 'remark', '', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('personnel', 'TENANT-SHWS', 'attendance', 'att-seed-002', jsonb_build_object(
    'id', 'att-seed-002', 'tenantId', 'TENANT-SHWS', 'recordNo', 'ATT-SEED-002', 'employeeId', 'EMP-1002',
    'employeeName', '李敏', 'recordDate', to_char(v_today, 'YYYY-MM-DD'), 'shift', 'day', 'clockIn', '08:12',
    'clockOut', '18:05', 'status', 'normal', 'remark', '', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('personnel', 'TENANT-SHWS', 'attendance', 'att-seed-003', jsonb_build_object(
    'id', 'att-seed-003', 'tenantId', 'TENANT-SHWS', 'recordNo', 'ATT-SEED-003', 'employeeId', 'EMP-1003',
    'employeeName', '王强', 'recordDate', to_char(v_today, 'YYYY-MM-DD'), 'shift', 'day', 'clockIn', '09:10',
    'clockOut', '18:12', 'status', 'late', 'remark', '', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('personnel', 'TENANT-SHWS', 'skill', 'skill-seed-001', jsonb_build_object(
    'id', 'skill-seed-001', 'tenantId', 'TENANT-SHWS', 'certNo', 'CERT-1001', 'employeeId', 'EMP-1001',
    'employeeName', '张工', 'skillName', '装配工艺操作证', 'level', '高级',
    'issueDate', to_char(v_today - 365, 'YYYY-MM-DD'), 'expiryDate', to_char(v_today - 5, 'YYYY-MM-DD'),
    'status', '已过期', 'issuer', '上海市人力资源和社会保障局', 'metadata', '{}', 'remark', '', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('personnel', 'TENANT-SHWS', 'skill', 'skill-seed-002', jsonb_build_object(
    'id', 'skill-seed-002', 'tenantId', 'TENANT-SHWS', 'certNo', 'CERT-1002', 'employeeId', 'EMP-1002',
    'employeeName', '李敏', 'skillName', '质量检验员证', 'level', '中级',
    'issueDate', to_char(v_today - 347, 'YYYY-MM-DD'), 'expiryDate', to_char(v_today + 18, 'YYYY-MM-DD'),
    'status', '即将到期', 'issuer', '上海市市场监督管理局', 'metadata', '{}', 'remark', '', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('personnel', 'TENANT-SHWS', 'skill', 'skill-seed-003', jsonb_build_object(
    'id', 'skill-seed-003', 'tenantId', 'TENANT-SHWS', 'certNo', 'CERT-1003', 'employeeId', 'EMP-1003',
    'employeeName', '王强', 'skillName', 'APS计划员认证', 'level', '高级',
    'issueDate', to_char(v_today - 185, 'YYYY-MM-DD'), 'expiryDate', to_char(v_today + 180, 'YYYY-MM-DD'),
    'status', '有效', 'issuer', '工业AI平台认证中心', 'metadata', '{}', 'remark', '', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),

  ('production', 'TENANT-SHWS', 'demand', 'demand-seed-001', jsonb_build_object(
    'id', 'demand-seed-001', 'tenantId', 'TENANT-SHWS', 'code', 'DM-SEED-001', 'sourceType', 'SALES_ORDER_SHORTAGE',
    'productId', 'PROD-1001', 'productName', '精密伺服模组', 'qty', '80', 'uom', 'PCS',
    'dueDate', to_char(v_today - 1, 'YYYY-MM-DD'), 'priority', 80, 'factoryResourceId', 'ORG-FAC-01',
    'status', 'PENDING_REVIEW', 'revision', 1, 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('production', 'TENANT-SHWS', 'demand', 'demand-seed-002', jsonb_build_object(
    'id', 'demand-seed-002', 'tenantId', 'TENANT-SHWS', 'code', 'DM-SEED-002', 'sourceType', 'SALES_ORDER_SHORTAGE',
    'productId', 'PROD-1002', 'productName', '高速输送模块', 'qty', '120', 'uom', 'PCS',
    'dueDate', to_char(v_today + 2, 'YYYY-MM-DD'), 'priority', 90, 'factoryResourceId', 'ORG-FAC-01',
    'status', 'RECEIVED', 'revision', 1, 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('production', 'TENANT-SHWS', 'demand', 'demand-seed-003', jsonb_build_object(
    'id', 'demand-seed-003', 'tenantId', 'TENANT-SHWS', 'code', 'DM-SEED-003', 'sourceType', 'SALES_ORDER_SHORTAGE',
    'productId', 'MAT-2001', 'productName', '驱动板卡组件', 'qty', '200', 'uom', 'PCS',
    'dueDate', to_char(v_today - 3, 'YYYY-MM-DD'), 'priority', 70, 'factoryResourceId', 'ORG-FAC-01',
    'status', 'BLOCKED', 'revision', 1, 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('production', 'TENANT-SHWS', 'workOrder', 'wo-seed-001', jsonb_build_object(
    'id', 'wo-seed-001', 'tenantId', 'TENANT-SHWS', 'code', 'WO-SEED-001', 'productId', 'PROD-1001',
    'productName', '精密伺服模组', 'factoryResourceId', 'ORG-FAC-01', 'workCenterResourceId', 'RES-WC-ASSY',
    'plannedQty', '100', 'inputQty', '100', 'reportedGoodQty', '60', 'reportedDefectQty', '0',
    'reportedScrapQty', '0', 'postedQty', '60', 'uom', 'PCS',
    'dueDate', to_char(v_today - 1, 'YYYY-MM-DD'), 'status', 'IN_PROGRESS', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('production', 'TENANT-SHWS', 'workOrder', 'wo-seed-002', jsonb_build_object(
    'id', 'wo-seed-002', 'tenantId', 'TENANT-SHWS', 'code', 'WO-SEED-002', 'productId', 'PROD-1002',
    'productName', '高速输送模块', 'factoryResourceId', 'ORG-FAC-01', 'workCenterResourceId', 'RES-WC-ASSY',
    'plannedQty', '80', 'inputQty', '80', 'reportedGoodQty', '20', 'reportedDefectQty', '0',
    'reportedScrapQty', '0', 'postedQty', '20', 'uom', 'PCS',
    'dueDate', to_char(v_today + 3, 'YYYY-MM-DD'), 'status', 'RELEASED', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('production', 'TENANT-SHWS', 'workOrder', 'wo-seed-003', jsonb_build_object(
    'id', 'wo-seed-003', 'tenantId', 'TENANT-SHWS', 'code', 'WO-SEED-003', 'productId', 'PROD-1003',
    'productName', '检测台架', 'factoryResourceId', 'ORG-FAC-01', 'workCenterResourceId', 'RES-WC-ASSY',
    'plannedQty', '50', 'inputQty', '50', 'reportedGoodQty', '50', 'reportedDefectQty', '0',
    'reportedScrapQty', '0', 'postedQty', '50', 'uom', 'PCS',
    'dueDate', to_char(v_today + 6, 'YYYY-MM-DD'), 'status', 'IN_PROGRESS', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('production', 'TENANT-SHWS', 'inspection', 'fqc-seed-001', jsonb_build_object(
    'id', 'fqc-seed-001', 'tenantId', 'TENANT-SHWS', 'code', 'FQC-SEED-001', 'workOrderId', 'wo-seed-001',
    'inspectionType', 'FQC', 'sampleQty', '150', 'passedQty', '0', 'failedQty', '0', 'status', 'CREATED', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('production', 'TENANT-SHWS', 'inspection', 'fqc-seed-002', jsonb_build_object(
    'id', 'fqc-seed-002', 'tenantId', 'TENANT-SHWS', 'code', 'FQC-SEED-002', 'workOrderId', 'wo-seed-003',
    'inspectionType', 'FQC', 'sampleQty', '80', 'passedQty', '0', 'failedQty', '0', 'status', 'DISPOSITION_PENDING', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),

  ('fulfillment', 'TENANT-SHWS', 'order', 'so-seed-001', jsonb_build_object(
    'id', 'so-seed-001', 'tenantId', 'TENANT-SHWS', 'orderNo', 'SO-SEED-001', 'customerId', 'cus-002',
    'customerName', '上海智造客户', 'currency', 'CNY', 'totalAmount', '128000', 'overallStatus', 'CONFIRMED',
    'reviewStatus', 'APPROVED', 'shipmentStatus', 'NOT_REQUESTED', 'allowPartialShipment', false,
    'requestedDeliveryDate', to_char(v_today - 1, 'YYYY-MM-DD'), 'factoryResourceId', 'ORG-FAC-01', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('fulfillment', 'TENANT-SHWS', 'order', 'so-seed-002', jsonb_build_object(
    'id', 'so-seed-002', 'tenantId', 'TENANT-SHWS', 'orderNo', 'SO-SEED-002', 'customerId', 'cus-001',
    'customerName', '苏州精密装备', 'currency', 'CNY', 'totalAmount', '386000', 'overallStatus', 'PENDING_CONFIRMATION',
    'reviewStatus', 'PENDING', 'shipmentStatus', 'NOT_REQUESTED', 'allowPartialShipment', true,
    'requestedDeliveryDate', to_char(v_today + 5, 'YYYY-MM-DD'), 'factoryResourceId', 'ORG-FAC-01', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('fulfillment', 'TENANT-SHWS', 'availability', 'TENANT-SHWS:WH-RM-01:MAT-2001', jsonb_build_object(
    'tenantId', 'TENANT-SHWS', 'warehouseId', 'WH-RM-01', 'productId', 'MAT-2001', 'onHandQty', '35',
    'reservedQty', '0', 'fulfillableQty', '35', 'safetyStockQty', '80', 'uom', 'PCS', 'factVersion', 1,
    'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('fulfillment', 'TENANT-SHWS', 'availability', 'TENANT-SHWS:WH-FG-01:PROD-1002', jsonb_build_object(
    'tenantId', 'TENANT-SHWS', 'warehouseId', 'WH-FG-01', 'productId', 'PROD-1002', 'onHandQty', '12',
    'reservedQty', '2', 'fulfillableQty', '10', 'safetyStockQty', '30', 'uom', 'PCS', 'factVersion', 1,
    'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('fulfillment', 'TENANT-SHWS', 'shipmentTask', 'shipment-seed-001', jsonb_build_object(
    'id', 'shipment-seed-001', 'tenantId', 'TENANT-SHWS', 'shipmentRequestId', 'request-seed-001',
    'salesOrderId', 'so-seed-001', 'requestNo', 'SR-SEED-001', 'salesOrderNo', 'SO-SEED-001',
    'warehouseId', 'WH-FG-01', 'workflowStatus', 'REQUESTED', 'availabilityStatus', 'UNCHECKED',
    'postingStatus', 'NOT_STARTED', 'version', 1, 'lines', jsonb_build_array(jsonb_build_object(
      'productId', 'PROD-1002', 'requestedQty', '10', 'reservedQty', '0')),
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('fulfillment', 'TENANT-SHWS', 'purchaseRequest', 'pr-seed-001', jsonb_build_object(
    'id', 'pr-seed-001', 'tenantId', 'TENANT-SHWS', 'requestNo', 'PR-SEED-001', 'materialId', 'MAT-2001',
    'materialName', '驱动板卡组件', 'requiredQty', '80', 'uom', 'PCS',
    'dueDate', to_char(v_today + 4, 'YYYY-MM-DD'), 'status', 'PENDING_APPROVAL', 'requesterId', 'emp-seed-003',
    'version', 1, 'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('fulfillment', 'TENANT-SHWS', 'purchaseOrder', 'po-seed-001', jsonb_build_object(
    'id', 'po-seed-001', 'tenantId', 'TENANT-SHWS', 'orderNo', 'PO-SEED-001', 'supplierId', 'sup-001',
    'supplierName', '深圳华芯科技', 'materialId', 'MAT-2001', 'orderedQty', '100', 'receivedQty', '0',
    'uom', 'PCS', 'currency', 'CNY', 'totalAmount', '154000', 'promisedDate', to_char(v_today + 6, 'YYYY-MM-DD'),
    'status', 'CONFIRMED', 'version', 1, 'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('fulfillment', 'TENANT-SHWS', 'purchaseOrder', 'po-seed-002', jsonb_build_object(
    'id', 'po-seed-002', 'tenantId', 'TENANT-SHWS', 'orderNo', 'PO-SEED-002', 'supplierId', 'sup-002',
    'supplierName', '宁波传动部件', 'materialId', 'MAT-2002', 'orderedQty', '60', 'receivedQty', '30',
    'uom', 'PCS', 'currency', 'CNY', 'totalAmount', '92000', 'promisedDate', to_char(v_today - 1, 'YYYY-MM-DD'),
    'status', 'PARTIALLY_RECEIVED', 'version', 2, 'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('fulfillment', 'TENANT-SHWS', 'purchaseReceipt', 'receipt-seed-001', jsonb_build_object(
    'id', 'receipt-seed-001', 'tenantId', 'TENANT-SHWS', 'receiptNo', 'RCV-SEED-001',
    'purchaseOrderId', 'po-seed-002', 'materialId', 'MAT-2002', 'receivedQty', '30', 'uom', 'PCS',
    'status', 'PENDING_INSPECTION', 'receivedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'version', 1)),
  ('fulfillment', 'TENANT-SHWS', 'stocktakeTask', 'stocktake-seed-001', jsonb_build_object(
    'id', 'stocktake-seed-001', 'tenantId', 'TENANT-SHWS', 'stocktakeNo', 'ST-SEED-001',
    'warehouseId', 'WH-RM-01', 'scope', 'full', 'status', 'DRAFT', 'reason', '月末抽盘',
    'assignedTo', 'emp-seed-001', 'version', 1, 'lines', jsonb_build_array(jsonb_build_object(
      'productId', 'MAT-2001', 'systemQty', '35', 'uom', 'PCS', 'lineStatus', 'PENDING')),
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),

  ('supplychain', 'TENANT-SHWS', 'supplier', 'sup-seed-001', jsonb_build_object(
    'id', 'sup-seed-001', 'tenantId', 'TENANT-SHWS', 'supplierNo', 'SUP-1001', 'name', '深圳华芯科技',
    'creditCode', '91440300MA5EXAMPLE', 'type', '供应商', 'category', '电子物料', 'qualification', '附件完整',
    'rating', 'A', 'riskLevel', '低', 'owner', '采购部', 'cooperationCount', 12, 'totalAmount', '1280000',
    'admittance', true, 'status', '正常', 'metadata', '{"certs":"营业执照 / ISO9001"}', 'remark', '', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('supplychain', 'TENANT-SHWS', 'supplier', 'sup-seed-002', jsonb_build_object(
    'id', 'sup-seed-002', 'tenantId', 'TENANT-SHWS', 'supplierNo', 'SUP-1002', 'name', '宁波传动部件',
    'creditCode', '91330200MA5EXAMPLE', 'type', '供应商', 'category', '机械传动件', 'qualification', '附件待上传',
    'rating', 'B', 'riskLevel', '中', 'owner', '采购部', 'cooperationCount', 5, 'totalAmount', '460000',
    'admittance', true, 'status', '正常', 'metadata', '{}', 'remark', '', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('supplychain', 'TENANT-SHWS', 'customer', 'cus-seed-001', jsonb_build_object(
    'id', 'cus-seed-001', 'tenantId', 'TENANT-SHWS', 'customerNo', 'CUS-1001', 'name', '苏州精密装备',
    'creditCode', '91320594MA1EXAMPLE', 'legalRepresentative', '陈明', 'operationStatus', '正常',
    'businessStatus', '开业', 'enterpriseSize', '大型企业', 'industry', '装备制造', 'revenue', '¥ 8,600万',
    'receivable', '¥ 386,000', 'overdueDays', 0, 'exposureLevel', '低', 'pressureLevel', '低', 'role', '下游客户',
    'alerts', '[]', 'status', '正常', 'metadata', '{}', 'remark', '', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('supplychain', 'TENANT-SHWS', 'customer', 'cus-seed-002', jsonb_build_object(
    'id', 'cus-seed-002', 'tenantId', 'TENANT-SHWS', 'customerNo', 'CUS-1002', 'name', '上海智造客户',
    'creditCode', '91310000MA1EXAMPLE', 'legalRepresentative', '周颖', 'operationStatus', '正常',
    'businessStatus', '开业', 'enterpriseSize', '中型企业', 'industry', '智能制造', 'revenue', '¥ 3,200万',
    'receivable', '¥ 108,000', 'overdueDays', 2, 'exposureLevel', '中', 'pressureLevel', '中', 'role', '下游客户',
    'alerts', '["应收逾期2天"]', 'status', '正常', 'metadata', '{}', 'remark', '', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('supplychain', 'TENANT-SHWS', 'riskEvent', 'risk-seed-001', jsonb_build_object(
    'id', 'risk-seed-001', 'tenantId', 'TENANT-SHWS', 'riskNo', 'RISK-SEED-001', 'companyName', '深圳华芯科技',
    'companyType', 'supplier', 'riskType', '交付延迟', 'riskLevel', '高', 'owner', 'admin',
    'action', '确认备料并调整运输方案', 'status', 'active', 'metadata', '{"impactOrders":1,"delayDays":2}',
    'remark', '上游物料交付预计延迟', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'admin')),
  ('ai', 'TENANT-SHWS', 'insight', 'insight-seed-001', jsonb_build_object(
    'id', 'insight-seed-001', 'tenantId', 'TENANT-SHWS', 'insightNo', 'AI-SEED-001', 'type', 'DELIVERY_RISK',
    'domain', 'production', 'severity', 'high', 'title', '逾期工单影响交付',
    'summary', 'WO-SEED-001 已逾期，完成率 60%，建议优先排产并锁定检验资源。',
    'detail', '{"workOrderId":"wo-seed-001","completionRate":"60"}', 'sourceType', 'WorkOrder',
    'sourceId', 'wo-seed-001', 'confidence', '0.92', 'status', 'active', 'expiresAt', to_char(v_today + 7, 'YYYY-MM-DD'),
    'dismissedBy', NULL, 'dismissedAt', NULL, 'metadata', '{"source":"work-order"}', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'system')),
  ('ai', 'TENANT-SHWS', 'insight', 'insight-seed-002', jsonb_build_object(
    'id', 'insight-seed-002', 'tenantId', 'TENANT-SHWS', 'insightNo', 'AI-SEED-002', 'type', 'INVENTORY_LOW_STOCK',
    'domain', 'inventory', 'severity', 'medium', 'title', '关键物料低于安全水位',
    'summary', '驱动板卡组件可用量 35，低于安全库存 80，建议补充 80 件。',
    'detail', '{"productId":"MAT-2001","shortageQty":"45"}', 'sourceType', 'InventoryFact',
    'sourceId', 'MAT-2001', 'confidence', '0.88', 'status', 'active', 'expiresAt', to_char(v_today + 5, 'YYYY-MM-DD'),
    'dismissedBy', NULL, 'dismissedAt', NULL, 'metadata', '{"source":"inventory-availability"}', 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'createdBy', 'system')),
  ('message', 'TENANT-SHWS', 'record', 'msg-seed-001', jsonb_build_object(
    'id', 'msg-seed-001', 'tenantId', 'TENANT-SHWS', 'msgNo', 'MSG-SEED-001', 'templateCode', NULL,
    'category', 'production', 'channel', 'in_app', 'priority', 'high', 'title', '工单 WO-SEED-001 已逾期',
    'body', '计划完工时间已过，当前完成率 60%，需要排产干预。', 'recipientId', 'admin', 'recipientName', '系统管理员',
    'senderId', 'system', 'senderName', '系统', 'sourceType', 'WorkOrder', 'sourceId', 'wo-seed-001', 'sourceDocNo', 'WO-SEED-001',
    'isRead', false, 'readAt', NULL, 'isArchived', false, 'archivedAt', NULL, 'isStarred', false,
    'metadata', '{}', 'status', 'sent', 'errorMessage', '', 'sentAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('message', 'TENANT-SHWS', 'record', 'msg-seed-002', jsonb_build_object(
    'id', 'msg-seed-002', 'tenantId', 'TENANT-SHWS', 'msgNo', 'MSG-SEED-002', 'templateCode', NULL,
    'category', 'sales', 'channel', 'in_app', 'priority', 'normal', 'title', '销售订单 SO-SEED-002 待审核',
    'body', '客户苏州精密装备的订单金额 386,000 元，等待订单审核。', 'recipientId', 'admin', 'recipientName', '系统管理员',
    'senderId', 'system', 'senderName', '系统', 'sourceType', 'SalesOrder', 'sourceId', 'so-seed-002', 'sourceDocNo', 'SO-SEED-002',
    'isRead', false, 'readAt', NULL, 'isArchived', false, 'archivedAt', NULL, 'isStarred', false,
    'metadata', '{}', 'status', 'sent', 'errorMessage', '', 'sentAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('message', 'TENANT-SHWS', 'record', 'msg-seed-003', jsonb_build_object(
    'id', 'msg-seed-003', 'tenantId', 'TENANT-SHWS', 'msgNo', 'MSG-SEED-003', 'templateCode', NULL,
    'category', 'inventory', 'channel', 'in_app', 'priority', 'normal', 'title', '采购收货 RCV-SEED-001 待检验',
    'body', '驱动连接件 30 PCS 已到货，待质检判定。', 'recipientId', 'admin', 'recipientName', '系统管理员',
    'senderId', 'system', 'senderName', '系统', 'sourceType', 'PurchaseReceipt', 'sourceId', 'receipt-seed-001', 'sourceDocNo', 'RCV-SEED-001',
    'isRead', false, 'readAt', NULL, 'isArchived', false, 'archivedAt', NULL, 'isStarred', false,
    'metadata', '{}', 'status', 'sent', 'errorMessage', '', 'sentAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('message', 'TENANT-SHWS', 'record', 'msg-seed-004', jsonb_build_object(
    'id', 'msg-seed-004', 'tenantId', 'TENANT-SHWS', 'msgNo', 'MSG-SEED-004', 'templateCode', NULL,
    'category', 'finance', 'channel', 'in_app', 'priority', 'high', 'title', '应收 AR 单据已逾期',
    'body', '上海智造客户应收余额 108,000 元已逾期 2 天。', 'recipientId', 'admin', 'recipientName', '系统管理员',
    'senderId', 'system', 'senderName', '系统', 'sourceType', 'Receivable', 'sourceId', 'ar-seed-002', 'sourceDocNo', 'AR-SEED-002',
    'isRead', false, 'readAt', NULL, 'isArchived', false, 'archivedAt', NULL, 'isStarred', false,
    'metadata', '{}', 'status', 'sent', 'errorMessage', '', 'sentAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  ('message', 'TENANT-SHWS', 'record', 'msg-seed-baseline', jsonb_build_object(
    'id', 'msg-seed-baseline', 'tenantId', 'TENANT-SHWS', 'msgNo', 'MSG-SEED-BASELINE', 'templateCode', NULL,
    'category', 'system', 'channel', 'in_app', 'priority', 'normal', 'title', '业务基线已初始化',
    'body', '数据库业务基线已载入，工作台指标由业务单据实时计算。', 'recipientId', 'admin', 'recipientName', '系统管理员',
    'senderId', 'system', 'senderName', '系统', 'sourceType', 'System', 'sourceId', 'msg-seed-baseline', 'sourceDocNo', 'MSG-SEED-BASELINE',
    'isRead', false, 'readAt', NULL, 'isArchived', false, 'archivedAt', NULL, 'isStarred', false,
    'metadata', '{}', 'status', 'sent', 'errorMessage', '', 'sentAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'version', 1,
    'createdAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));

  RAISE NOTICE 'Seeded traceable business baseline for month %', v_month;
END $$;

COMMIT;
