type ProductMetadata = {
  id: string;
  code?: string;
  name?: string;
  specification?: string;
};

type ProductLine = {
  productId: string;
  productName?: string;
  productCode?: string;
  specification?: string;
  spec?: string;
};

export const presentOutboundLine = <T extends ProductLine>(
  line: T,
  products: readonly ProductMetadata[] = [],
) => {
  const product = products.find(item => item.id === line.productId);
  // Display metadata never replaces the stable IDs used by reservation and posting.
  const name = line.productName?.trim();
  const productName = name && name !== line.productId && name !== '产品名称未获取'
    ? name : product?.name || '产品名称未获取';
  const productCode = line.productCode && line.productCode !== '编码未获取'
    ? line.productCode : product?.code || '编码未获取';
  return {
    ...line,
    productName,
    productCode,
    productLabel: `${productName}（${productCode}）`,
    spec: line.spec || line.specification || product?.specification || '',
  };
};

type OutboundRecord = {
  item?: string;
  productId?: string;
  lines?: ProductLine[];
  formalTask?: { lines: ProductLine[] };
};

export const formatOutboundProductSummary = (
  row: OutboundRecord,
  products: readonly ProductMetadata[] = [],
) => {
  const lines = row?.formalTask?.lines?.length ? row.formalTask.lines : row?.lines;
  if (lines?.length) return lines.map(line => presentOutboundLine(line, products).productLabel).join('；');
  if (row?.productId) return presentOutboundLine({
    productId: row.productId, productName: row.item,
  }, products).productLabel;
  return row?.item || '产品信息未获取';
};

export const presentOutboundRecord = <T extends OutboundRecord>(
  row: T,
  products: readonly ProductMetadata[] = [],
) => ({
  ...row,
  item: formatOutboundProductSummary(row, products),
  lines: row.lines?.map(line => presentOutboundLine(line, products)),
  formalTask: row.formalTask ? {
    ...row.formalTask, lines: row.formalTask.lines.map(line => presentOutboundLine(line, products)),
  } : undefined,
});

export const formatOutboundError = (
  message: string,
  lines: readonly ProductLine[],
  products: readonly ProductMetadata[] = [],
) => {
  const labels = new Map(lines.filter(line => line.productId)
    .map(line => [line.productId, presentOutboundLine(line, products).productLabel]));
  const ids = [...labels.keys()].sort((a, b) => b.length - a.length);
  if (!ids.length) return message;
  const pattern = ids.map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // Match complete identifiers only; server diagnostics remain intact for other objects.
  return message.replace(new RegExp(`(^|[^\\w-])(${pattern})(?=$|[^\\w-])`, 'g'),
    (_match, prefix: string, id: string) => `${prefix}${labels.get(id)}`);
};
