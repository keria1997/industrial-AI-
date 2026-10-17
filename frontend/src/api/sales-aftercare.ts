import { apiRequest, type ApiContext } from './client';
import { requireApiPage, type ApiPage } from '../shared/apiCollection';

export type RmaReadDto = {
  id: string;
  rmaNo?: string | null;
  orderId?: string | null;
  orderNo?: string | null;
  productName?: string | null;
  requestedQty?: string | null;
  approvedQty?: string | null;
  receivedQty?: string | null;
  qualifiedQty?: string | null;
  status?: string | null;
  creditArId?: string | null;
  creditArAmount?: string | null;
  currency?: string | null;
  createdAt?: string | null;
  version?: number | null;
};

export type CustomerReceiptReadDto = {
  id: string;
  receiptNo?: string | null;
  orderId?: string | null;
  orderNo?: string | null;
  customerName?: string | null;
  signedQty?: string | null;
  rejectedQty?: string | null;
  damagedQty?: string | null;
  receiptStatus?: string | null;
  status?: string | null;
  signedAt?: string | null;
  version?: number | null;
};

async function readPage<T extends { id: string }>(
  path: string, context: ApiContext, page: number, pageSize: number,
): Promise<ApiPage<T>> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  // UI -> Java business API -> tenant-scoped persistent Store; no browser business cache.
  const result = requireApiPage(await apiRequest<ApiPage<T>>(`${path}?${query}`, context));
  const ids = new Set<string>();
  for (const row of result.items) {
    if (!row || typeof row.id !== 'string' || !row.id.trim() || ids.has(row.id)) {
      throw new Error('返回的业务记录标识缺失或重复，请重试');
    }
    ids.add(row.id);
  }
  return result;
}

/** Read RMA facts only; unsafe lifecycle commands are intentionally not exposed. */
export const listSalesRmas = (context: ApiContext, page = 1, pageSize = 20) =>
  readPage<RmaReadDto>('/api/v1/fulfillment/rmas', context, page, pageSize);

/** Read receipt facts independently from sales order completion. */
export const listCustomerReceipts = (context: ApiContext, page = 1, pageSize = 20) =>
  readPage<CustomerReceiptReadDto>('/api/v1/fulfillment/customer-receipts', context, page, pageSize);
