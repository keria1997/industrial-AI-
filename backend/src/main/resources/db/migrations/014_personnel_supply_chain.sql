-- Personnel & Supply Chain Management: employee directory, attendance, skills, suppliers, customers, risk.
BEGIN;

CREATE OR REPLACE FUNCTION hr_sc_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ===== Personnel: Employee Directory =====
CREATE TABLE hr_employee (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  employee_no text NOT NULL,
  name text NOT NULL,
  department text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  hire_date date,
  leave_date date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, employee_no),
  CHECK (status IN ('active','transferring','leave','resigned'))
);

CREATE TRIGGER hr_employee_touch BEFORE UPDATE ON hr_employee
  FOR EACH ROW EXECUTE FUNCTION hr_sc_touch_updated_at();

-- ===== Personnel: Attendance =====
CREATE TABLE hr_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  record_no text NOT NULL,
  employee_id text NOT NULL,
  employee_name text NOT NULL DEFAULT '',
  record_date date NOT NULL,
  shift text NOT NULL DEFAULT '早班',
  clock_in time,
  clock_out time,
  status text NOT NULL DEFAULT '正常',
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, record_no),
  CHECK (shift IN ('早班','中班','晚班','休息')),
  CHECK (status IN ('正常','迟到','早退','缺勤','请假','加班'))
);

CREATE TRIGGER hr_attendance_touch BEFORE UPDATE ON hr_attendance
  FOR EACH ROW EXECUTE FUNCTION hr_sc_touch_updated_at();

-- ===== Personnel: Skills & Certifications =====
CREATE TABLE hr_skill (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  cert_no text NOT NULL,
  employee_id text NOT NULL,
  employee_name text NOT NULL DEFAULT '',
  skill_name text NOT NULL,
  level text NOT NULL DEFAULT '初级',
  issue_date date,
  expiry_date date,
  status text NOT NULL DEFAULT '有效',
  issuer text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, cert_no),
  CHECK (level IN ('初级','中级','高级','技师','高级技师')),
  CHECK (status IN ('有效','即将到期','已过期','已撤销'))
);

CREATE TRIGGER hr_skill_touch BEFORE UPDATE ON hr_skill
  FOR EACH ROW EXECUTE FUNCTION hr_sc_touch_updated_at();

-- ===== Supply Chain: Supplier =====
CREATE TABLE sc_supplier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  supplier_no text NOT NULL,
  name text NOT NULL,
  credit_code text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT '上游供应商',
  category text NOT NULL DEFAULT '',
  qualification text NOT NULL DEFAULT '附件待上传',
  rating text NOT NULL DEFAULT 'B',
  risk_level text NOT NULL DEFAULT '中',
  owner text NOT NULL DEFAULT '',
  cooperation_count integer NOT NULL DEFAULT 0,
  total_amount text NOT NULL DEFAULT '',
  admittance text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, supplier_no),
  CHECK (rating IN ('A','B','C','D')),
  CHECK (risk_level IN ('低','中','高')),
  CHECK (status IN ('active','suspended','blacklisted'))
);

CREATE TRIGGER sc_supplier_touch BEFORE UPDATE ON sc_supplier
  FOR EACH ROW EXECUTE FUNCTION hr_sc_touch_updated_at();

-- ===== Supply Chain: Customer =====
CREATE TABLE sc_customer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  customer_no text NOT NULL,
  name text NOT NULL,
  credit_code text NOT NULL DEFAULT '',
  legal_representative text NOT NULL DEFAULT '',
  operation_status text NOT NULL DEFAULT '正常',
  business_status text NOT NULL DEFAULT '存续',
  enterprise_size text NOT NULL DEFAULT '',
  industry text NOT NULL DEFAULT '',
  revenue text NOT NULL DEFAULT '',
  receivable text NOT NULL DEFAULT '',
  overdue_days integer NOT NULL DEFAULT 0,
  exposure_level text NOT NULL DEFAULT '低',
  pressure_level text NOT NULL DEFAULT '低',
  role text NOT NULL DEFAULT '产业链客户',
  alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, customer_no),
  CHECK (exposure_level IN ('低','中','高')),
  CHECK (pressure_level IN ('低','中','高')),
  CHECK (status IN ('active','frozen','blacklisted'))
);

CREATE TRIGGER sc_customer_touch BEFORE UPDATE ON sc_customer
  FOR EACH ROW EXECUTE FUNCTION hr_sc_touch_updated_at();

-- ===== Supply Chain: Risk Event =====
CREATE TABLE sc_risk_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  risk_no text NOT NULL,
  company_name text NOT NULL,
  company_type text NOT NULL DEFAULT 'customer',
  risk_type text NOT NULL,
  risk_level text NOT NULL DEFAULT '中风险',
  owner text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, risk_no),
  CHECK (company_type IN ('customer','supplier')),
  CHECK (risk_level IN ('低风险','中风险','高风险')),
  CHECK (status IN ('active','processing','resolved','ignored'))
);

CREATE TRIGGER sc_risk_event_touch BEFORE UPDATE ON sc_risk_event
  FOR EACH ROW EXECUTE FUNCTION hr_sc_touch_updated_at();

-- ===== RLS Policies =====
ALTER TABLE hr_employee ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employee_tenant ON hr_employee USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE hr_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_attendance FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_attendance_tenant ON hr_attendance USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE hr_skill ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_skill FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_skill_tenant ON hr_skill USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE sc_supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE sc_supplier FORCE ROW LEVEL SECURITY;
CREATE POLICY sc_supplier_tenant ON sc_supplier USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE sc_customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE sc_customer FORCE ROW LEVEL SECURITY;
CREATE POLICY sc_customer_tenant ON sc_customer USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE sc_risk_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE sc_risk_event FORCE ROW LEVEL SECURITY;
CREATE POLICY sc_risk_event_tenant ON sc_risk_event USING (tenant_id = current_setting('app.tenant_id', true));

-- ===== Seed Demo Data =====
INSERT INTO hr_employee (tenant_id, employee_no, name, department, position, phone, status, hire_date, created_by)
VALUES
  ('TENANT-SHWS', 'EMP-001', '王建国', '总装车间', '高级装配工', '138****1234', 'active', '2020-03-15', 'system'),
  ('TENANT-SHWS', 'EMP-002', '李芳', '质检部', '质检工程师', '139****5678', 'active', '2021-07-01', 'system'),
  ('TENANT-SHWS', 'EMP-003', '张伟', '仓库', '仓库管理员', '137****9012', 'active', '2019-11-20', 'system');

INSERT INTO hr_attendance (tenant_id, record_no, employee_id, employee_name, record_date, shift, clock_in, clock_out, status, created_by)
VALUES
  ('TENANT-SHWS', 'ATT-20260728-01', 'EMP-001', '王建国', '2026-07-28', '早班', '07:55', '16:05', '正常', 'system'),
  ('TENANT-SHWS', 'ATT-20260728-02', 'EMP-002', '李芳', '2026-07-28', '早班', '08:02', '17:00', '迟到', 'system'),
  ('TENANT-SHWS', 'ATT-20260728-03', 'EMP-003', '张伟', '2026-07-28', '中班', '15:58', '23:50', '正常', 'system');

INSERT INTO hr_skill (tenant_id, cert_no, employee_id, employee_name, skill_name, level, issue_date, expiry_date, status, issuer, created_by)
VALUES
  ('TENANT-SHWS', 'CERT-001', 'EMP-001', '王建国', '高压电工作业证', '高级', '2024-05-10', '2027-05-09', '有效', '应急管理局', 'system'),
  ('TENANT-SHWS', 'CERT-002', 'EMP-002', '李芳', '无损检测资格证', '中级', '2023-09-01', '2026-08-31', '即将到期', '市场监管总局', 'system'),
  ('TENANT-SHWS', 'CERT-003', 'EMP-003', '张伟', '叉车操作证', '中级', '2022-03-15', '2025-03-14', '已过期', '市场监管局', 'system');

INSERT INTO sc_supplier (tenant_id, supplier_no, name, credit_code, type, category, qualification, rating, risk_level, owner, cooperation_count, admittance, created_by)
VALUES
  ('TENANT-SHWS', 'SUP-001', '深圳恒通电子科技有限公司', '91440300MA5XXX1', '上游供应商', '电子元器件', '附件待上传', 'B', '中', '李明', 0, '可建档，关键采购前补附件', 'system'),
  ('TENANT-SHWS', 'SUP-002', '东莞精密机械制造厂', '91441900MA5XXX2', '上游供应商', '机械加工', '已上传', 'A', '低', '王芳', 12, '已准入', 'system'),
  ('TENANT-SHWS', 'SUP-003', '苏州瑞达材料科技', '91320500MA5XXX3', '上游供应商', '原材料', '附件待上传', 'C', '高', '李明', 3, '需补充资质后审批', 'system');

INSERT INTO sc_customer (tenant_id, customer_no, name, credit_code, legal_representative, operation_status, business_status, enterprise_size, industry, revenue, receivable, overdue_days, exposure_level, pressure_level, role, alerts, created_by)
VALUES
  ('TENANT-SHWS', 'CUS-001', '中国石油化工股份有限公司', '91110000XXX1', '侯启军', '正常', '存续（在营、开业、在册）', '大型央企', '能源化工', '¥ 12,117,761.37万', '¥ 0', 0, '低', '低', '产业链客户', '[]'::jsonb, 'system'),
  ('TENANT-SHWS', 'CUS-002', '上蔡泉洁商贸有限公司', '91411722XXX2', '张三', '异常', '存续', '小型企业', '商贸', '¥ 500万', '¥ 186,400', 45, '高', '高', '产业链客户', '["未依照规定公示年度报告","应收账款逾期45天"]'::jsonb, 'system'),
  ('TENANT-SHWS', 'CUS-003', '北京智控科技集团', '91110108XXX3', '李四', '正常', '存续', '中型企业', '智能制造', '¥ 3,200万', '¥ 52,300', 5, '低', '低', '产业链客户', '[]'::jsonb, 'system');

INSERT INTO sc_risk_event (tenant_id, risk_no, company_name, company_type, risk_type, risk_level, owner, action, created_by)
VALUES
  ('TENANT-SHWS', 'RISK-001', '上蔡泉洁商贸有限公司', 'customer', '经营异常 + 应收逾期', '高风险', '销售 / 财务', '冻结新增账期，转预付款或分批交付', 'system'),
  ('TENANT-SHWS', 'RISK-002', '苏州瑞达材料科技', 'supplier', '资质不全 + 评级偏低', '中风险', '采购', '要求补充资质文件，限制大额采购', 'system'),
  ('TENANT-SHWS', 'RISK-003', '北京智控科技集团', 'customer', '应收账款即将到期', '低风险', '销售', '跟进回款进度，发送对账单', 'system');

COMMIT;
