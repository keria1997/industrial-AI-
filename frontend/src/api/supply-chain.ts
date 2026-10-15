import { apiRequest, type ApiContext } from './client';

// ===== Types =====
export type SupplierRating = 'A' | 'B' | 'C' | 'D';
export type SupplierRiskLevel = '低' | '中' | '高';
export type SupplierStatus = 'active' | 'suspended' | 'blacklisted';
export type CustomerExposureLevel = '低' | '中' | '高';
export type CustomerStatus = 'active' | 'frozen' | 'blacklisted';
export type RiskEventLevel = '低风险' | '中风险' | '高风险';
export type RiskEventStatus = 'active' | 'processing' | 'resolved' | 'ignored';
export type CompanySurvivalResult = 'SURVIVING' | 'NOT_SURVIVING' | 'NEEDS_REVIEW' | 'NOT_FOUND';

export type SupplierDto = {
  id: string; supplierNo: string; name: string; creditCode: string;
  type: string; category: string; qualification: string;
  rating: SupplierRating; riskLevel: SupplierRiskLevel;
  owner: string; cooperationCount: number; totalAmount: string;
  admittance: string; status: SupplierStatus;
  metadata: Record<string, unknown>; remark: string;
  version: number; createdAt: string; updatedAt: string; createdBy: string;
};

export type CustomerDto = {
  id: string; customerNo: string; name: string; creditCode: string;
  legalRepresentative: string; operationStatus: string; businessStatus: string;
  enterpriseSize: string; industry: string; revenue: string;
  receivable: string; overdueDays: number;
  exposureLevel: CustomerExposureLevel; pressureLevel: CustomerExposureLevel;
  role: string; alerts: string[];
  status: CustomerStatus;
  metadata: Record<string, unknown>; remark: string;
  version: number; createdAt: string; updatedAt: string; createdBy: string;
};

export type RiskEventDto = {
  id: string; riskNo: string; companyName: string;
  companyType: 'customer' | 'supplier';
  riskType: string; riskLevel: RiskEventLevel;
  owner: string; action: string;
  status: RiskEventStatus;
  metadata: Record<string, unknown>; remark: string;
  version: number; createdAt: string; updatedAt: string; createdBy: string;
};

export type SupplyChainDashboardDto = {
  totalSuppliers: number; activeSuppliers: number;
  totalCustomers: number; activeCustomers: number;
  highRiskSuppliers: number; highExposureCustomers: number;
  activeRiskEvents: number; resolvedRiskEvents: number;
  recentRiskEvents: RiskEventDto[];
};

export type CompanySearchCandidate = {
  keyNo: string; name: string; creditCode: string; legalRepresentative: string;
  registrationStatus: string; establishedOn: string; survivalResult: CompanySurvivalResult;
};

export type CompanyVerification = {
  query: { name: string; creditCode?: string };
  result: CompanySurvivalResult;
  message: string;
  registrationStatus?: string;
  creditCode?: string;
  keyNo?: string;
  candidates: CompanySearchCandidate[];
  verifiedAt: string;
};

const key = (scope: string) => `${scope}:${crypto.randomUUID()}`;

export const supplyChainApi = {
  // ===== Suppliers =====
  listSuppliers: (context: ApiContext, filter?: { page?: number; pageSize?: number; search?: string; status?: string; riskLevel?: string }) => {
    const params = new URLSearchParams();
    if (filter) for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null) params.append(k, String(v));
    return apiRequest<{ items: SupplierDto[]; total: number }>(`/api/v1/supply-chain/suppliers?${params.toString()}`, context);
  },
  getSupplier: (context: ApiContext, id: string) =>
    apiRequest<SupplierDto>(`/api/v1/supply-chain/suppliers/${id}`, context),
  createSupplier: (context: ApiContext, input: { supplierNo: string; name: string; creditCode?: string; type?: string; category?: string; qualification?: string; rating?: string; riskLevel?: string; owner?: string; admittance?: string; remark?: string }) =>
    apiRequest<{ supplier: SupplierDto }>('/api/v1/supply-chain/suppliers', context, { method: 'POST', idempotencyKey: key(`sc-sup-create:${input.supplierNo}`), body: JSON.stringify(input) }),
  updateSupplier: (context: ApiContext, supplier: SupplierDto, input: Partial<{ name: string; creditCode: string; type: string; category: string; qualification: string; rating: string; riskLevel: string; owner: string; status: string; admittance: string; remark: string }>) =>
    apiRequest<{ supplier: SupplierDto }>(`/api/v1/supply-chain/suppliers/${supplier.id}`, context, { method: 'PATCH', expectedVersion: supplier.version, idempotencyKey: key(`sc-sup-update:${supplier.id}`), body: JSON.stringify(input) }),
  deleteSupplier: (context: ApiContext, supplier: SupplierDto) =>
    apiRequest<{ deleted: boolean }>(`/api/v1/supply-chain/suppliers/${supplier.id}`, context, { method: 'DELETE', expectedVersion: supplier.version, idempotencyKey: key(`sc-sup-delete:${supplier.id}`) }),

  // ===== Customers =====
  listCustomers: (context: ApiContext, filter?: { page?: number; pageSize?: number; search?: string; status?: string; exposureLevel?: string }) => {
    const params = new URLSearchParams();
    if (filter) for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null) params.append(k, String(v));
    return apiRequest<{ items: CustomerDto[]; total: number }>(`/api/v1/supply-chain/customers?${params.toString()}`, context);
  },
  getCustomer: (context: ApiContext, id: string) =>
    apiRequest<CustomerDto>(`/api/v1/supply-chain/customers/${id}`, context),
  createCustomer: (context: ApiContext, input: { customerNo: string; name: string; creditCode?: string; legalRepresentative?: string; operationStatus?: string; businessStatus?: string; enterpriseSize?: string; industry?: string; revenue?: string; receivable?: string; overdueDays?: number; exposureLevel?: string; pressureLevel?: string; role?: string; alerts?: string[]; remark?: string }) =>
    apiRequest<{ customer: CustomerDto }>('/api/v1/supply-chain/customers', context, { method: 'POST', idempotencyKey: key(`sc-cus-create:${input.customerNo}`), body: JSON.stringify(input) }),
  updateCustomer: (context: ApiContext, customer: CustomerDto, input: Partial<{ name: string; creditCode: string; legalRepresentative: string; operationStatus: string; businessStatus: string; enterpriseSize: string; industry: string; revenue: string; receivable: string; overdueDays: number; exposureLevel: string; pressureLevel: string; status: string; alerts: string[]; metadata: Record<string, unknown>; remark: string }>) =>
    apiRequest<{ customer: CustomerDto }>(`/api/v1/supply-chain/customers/${customer.id}`, context, { method: 'PATCH', expectedVersion: customer.version, idempotencyKey: key(`sc-cus-update:${customer.id}`), body: JSON.stringify(input) }),
  deleteCustomer: (context: ApiContext, customer: CustomerDto) =>
    apiRequest<{ deleted: boolean }>(`/api/v1/supply-chain/customers/${customer.id}`, context, { method: 'DELETE', expectedVersion: customer.version, idempotencyKey: key(`sc-cus-delete:${customer.id}`) }),

  verifyCompany: (context: ApiContext, input: { name: string; creditCode?: string }) => {
    const params = new URLSearchParams({ name: input.name });
    if (input.creditCode) params.append('creditCode', input.creditCode);
    return apiRequest<CompanyVerification>(`/api/v1/supply-chain/company-verifications?${params.toString()}`, context);
  },

  // ===== Risk Events =====
  listRiskEvents: (context: ApiContext, filter?: { page?: number; pageSize?: number; search?: string; status?: string; riskLevel?: string; companyType?: string }) => {
    const params = new URLSearchParams();
    if (filter) for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null) params.append(k, String(v));
    return apiRequest<{ items: RiskEventDto[]; total: number }>(`/api/v1/supply-chain/risk-events?${params.toString()}`, context);
  },
  getRiskEvent: (context: ApiContext, id: string) =>
    apiRequest<RiskEventDto>(`/api/v1/supply-chain/risk-events/${id}`, context),
  createRiskEvent: (context: ApiContext, input: { companyName: string; companyType?: string; riskType: string; riskLevel?: string; owner?: string; action?: string; remark?: string }) =>
    apiRequest<{ riskEvent: RiskEventDto }>('/api/v1/supply-chain/risk-events', context, { method: 'POST', idempotencyKey: key('sc-risk-create'), body: JSON.stringify(input) }),
  updateRiskEvent: (context: ApiContext, riskEvent: RiskEventDto, input: Partial<{ riskType: string; riskLevel: string; owner: string; action: string; status: string; remark: string }>) =>
    apiRequest<{ riskEvent: RiskEventDto }>(`/api/v1/supply-chain/risk-events/${riskEvent.id}`, context, { method: 'PATCH', expectedVersion: riskEvent.version, idempotencyKey: key(`sc-risk-update:${riskEvent.id}`), body: JSON.stringify(input) }),
  resolveRiskEvent: (context: ApiContext, riskEvent: RiskEventDto, input: { action?: string; remark?: string }) =>
    apiRequest<{ riskEvent: RiskEventDto }>(`/api/v1/supply-chain/risk-events/${riskEvent.id}/resolve`, context, { method: 'POST', expectedVersion: riskEvent.version, idempotencyKey: key(`sc-risk-resolve:${riskEvent.id}`), body: JSON.stringify(input) }),

  // ===== Dashboard =====
  getDashboard: (context: ApiContext) =>
    apiRequest<SupplyChainDashboardDto>('/api/v1/supply-chain/dashboard', context),
};
