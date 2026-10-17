import { supplyChainApi, type CustomerDto } from '../../../api/supply-chain';
import type { ApiContext } from '../../../api/client';

export const mapSalesCustomer = (customer: CustomerDto) => {
  const metadata = customer.metadata || {};
  return {
    id: customer.id, customerNo: customer.customerNo, formalCustomer: customer,
    name: customer.name, code: customer.creditCode || '-',
    contact: String(metadata.contact || ''), phone: String(metadata.phone || ''),
    level: String(metadata.level || ''), industry: customer.industry || '',
    address: String(metadata.address || ''), owner: String(metadata.owner || ''),
    lastInteractionAt: String(metadata.lastInteractionAt || ''),
    contacts: Array.isArray(metadata.contacts) ? metadata.contacts : [],
    status: String(metadata.salesStatus || ({ active: '合作中', frozen: '已冻结', blacklisted: '黑名单' }[customer.status] || customer.status)),
    remark: customer.remark || '', createdAt: customer.createdAt,
  };
};

export async function saveSalesCustomer(context: ApiContext, draft: ReturnType<typeof mapSalesCustomer>) {
  const current = draft.formalCustomer;
  const input = {
    name: draft.name, creditCode: draft.code === '-' ? '' : draft.code,
    industry: draft.industry, remark: draft.remark,
    metadata: {
      ...current?.metadata, contact: draft.contact, phone: draft.phone, level: draft.level,
      address: draft.address, owner: draft.owner, lastInteractionAt: draft.lastInteractionAt,
      contacts: draft.contacts, salesStatus: draft.status,
    },
  };
  // Sales UI -> customer business API; UUID and version come from the server.
  const result = current
    ? await supplyChainApi.updateCustomer(context, current, input)
    : await supplyChainApi.createCustomer(context, { ...input, customerNo: draft.customerNo || draft.id });
  return mapSalesCustomer(result.customer);
}
