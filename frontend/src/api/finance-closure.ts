import { apiRequest, type ApiContext } from './client';
import { requireApiPage } from '../shared/apiCollection';

export type ArApLedgerRow = {
  financeId: string; documentType: string; sourceType: string; sourceId: string;
  partyId: string; partyName: string; currency: string; totalAmount: string;
  allocatedAmount: string; outstandingAmount: string; status: string;
};
export type AllocationFact = {
  id: string; allocationNo: string; paymentId: string; currency: string;
  lines: Array<{ documentType: string; documentId: string; amount: string }>;
  status: string; createdAt: string; createdBy: string; version: number;
};
export type LedgerFilter = { partyId?: string; currency?: string; status?: string; dueDate?: string };

/** Direct array contract; the server currently caps each document type at 1000 rows. */
export async function listArApLedger(context: ApiContext, filter: LedgerFilter) {
  const query = new URLSearchParams();
  Object.entries(filter).forEach(([field, value]) => { if (value) query.set(field, value); });
  const result = await apiRequest<ArApLedgerRow[]>(`/api/v1/finance/ar-aps?${query}`, context);
  if (!Array.isArray(result) || result.some(item => !item?.financeId)) throw new Error('合并台账响应与契约不一致');
  return result;
}

/** Read allocation facts independently; confirming a payment never triggers another allocation here. */
export async function listAllocationFacts(context: ApiContext, page: number, search: string) {
  const query = new URLSearchParams({ page: String(page), pageSize: '20', search });
  return requireApiPage(await apiRequest<{ items: AllocationFact[]; total: number }>(`/api/v1/finance/allocations?${query}`, context));
}
