import { describe, expect, it } from 'vitest';
import { formatOutboundError, formatOutboundProductSummary, presentOutboundLine, presentOutboundRecord } from '../../features/inventory/model/outboundPresentation';

const id = '2c4bf33d-78df-4d3c-b418-46683d010d2e';
const products = [{ id, name: 'ssa', code: 'SAS', specification: '标准型' }];

describe('outbound product presentation', () => {
  it('resolves names without any availability records and preserves command identities and quantities', () => {
    const line = { id: 'line-id', orderLineId: 'order-line-id', productId: id, reservedQty: '0.000001' };
    expect(presentOutboundLine(line, products)).toMatchObject({
      ...line, productName: 'ssa', productCode: 'SAS', productLabel: 'ssa（SAS）', spec: '标准型',
    });
    expect(line).not.toHaveProperty('productName');
    expect(formatOutboundProductSummary({ formalTask: { lines: [line] } }, products)).toBe('ssa（SAS）');
  });

  it('preserves a real historical name, without treating an ID fallback as a name', () => {
    expect(presentOutboundLine({ productId: id, productName: '历史名称' }, products).productName).toBe('历史名称');
    expect(presentOutboundLine({ productId: id, productName: id }, products).productName).toBe('ssa');
    expect(presentOutboundLine({ productId: id }, []).productLabel).toBe('产品名称未获取（编码未获取）');
    expect(formatOutboundProductSummary({ productId: id, item: id }, [])).not.toContain(id);
  });

  it('does not resolve an ID by similar names, codes, or stock records', () => {
    expect(presentOutboundLine({ productId: 'SAS' }, products).productCode).toBe('编码未获取');
    expect(presentOutboundLine({ productId: id }, [{ ...products[0], id: 'another-id' }]).productName).toBe('产品名称未获取');
  });

  it('shows all order lines and can resolve a later successful metadata read', () => {
    const row = { formalTask: { lines: [{ productId: id }, { productId: 'second' }] } };
    expect(formatOutboundProductSummary(row, []).split('；')).toHaveLength(2);
    expect(formatOutboundProductSummary(row, [...products, { id: 'second', name: '配件', code: 'PART' }]))
      .toBe('ssa（SAS）；配件（PART）');
    const pending = presentOutboundRecord(row);
    expect(presentOutboundRecord(pending, products).formalTask.lines[0].productName).toBe('ssa');
    expect(row.formalTask.lines[0]).toEqual({ productId: id });
  });

  it('translates product identifiers in API messages without corrupting longer identifiers or replacement symbols', () => {
    const lines = [{ productId: id }];
    expect(formatOutboundError(`未查询到库存记录：${id}`, lines, products)).toBe('未查询到库存记录：ssa（SAS）');
    expect(formatOutboundError(`${id}：单位不一致；${id}`, lines, products)).not.toContain(id);
    expect(formatOutboundError(`${id}-extra`, lines, products)).toBe(`${id}-extra`);
    expect(formatOutboundError('未知仓库：warehouse-id', lines, products)).toBe('未知仓库：warehouse-id');
    expect(formatOutboundError('FG.1: 失败', [{ productId: 'FG.1' }], [{ id: 'FG.1', name: '$&', code: 'A' }]))
      .toBe('$&（A）: 失败');
  });
});
