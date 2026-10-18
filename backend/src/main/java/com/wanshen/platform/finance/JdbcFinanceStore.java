package com.wanshen.platform.finance;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.storage.JdbcModuleStoreSupport;
import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;

import javax.sql.DataSource;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public class JdbcFinanceStore extends JdbcModuleStoreSupport implements AbstractFinanceStore {
    public JdbcFinanceStore(DataSource dataSource, ObjectMapper objectMapper) {
        super(dataSource, objectMapper, "finance");
    }

    @Override
    public List<OutboxEvent> pendingOutbox(String tenantId) {
        return super.pendingModuleOutbox(tenantId);
    }

    @Override
    public Page<Receivable> receivables(String tenantId, FinanceFilter filter) {
        return page(documents(tenantId, "receivable", Receivable.class).stream()
                .filter(item -> financeMatch(item.status(), item.sourceId(), item.sourceDocNo(), filter,
                        item.docNo(), item.title(), item.customerName()))
                .sorted(Comparator.comparing(Receivable::createdAt).reversed()).toList(), filter);
    }
    @Override
    public Optional<Receivable> receivable(String tenantId, String id) {
        return document(tenantId, "receivable", id, Receivable.class);
    }
    @Override
    public Optional<Receivable> receivableBySource(String tenantId, String sourceType, String sourceId) {
        return documents(tenantId, "receivable", Receivable.class).stream()
                .filter(item -> item.sourceType().equals(sourceType) && item.sourceId().equals(sourceId)).findFirst();
    }
    @Override
    public void saveReceivable(Receivable value) { putDocument(value.tenantId(), "receivable", value.id(), value); }

    @Override
    public Page<Payable> payables(String tenantId, FinanceFilter filter) {
        return page(documents(tenantId, "payable", Payable.class).stream()
                .filter(item -> financeMatch(item.status(), item.sourceId(), item.sourceDocNo(), filter,
                        item.docNo(), item.title(), item.supplierName()))
                .sorted(Comparator.comparing(Payable::createdAt).reversed()).toList(), filter);
    }
    @Override
    public Optional<Payable> payable(String tenantId, String id) {
        return document(tenantId, "payable", id, Payable.class);
    }
    @Override
    public Optional<Payable> payableBySource(String tenantId, String sourceType, String sourceId) {
        return documents(tenantId, "payable", Payable.class).stream()
                .filter(item -> item.sourceType().equals(sourceType) && item.sourceId().equals(sourceId)).findFirst();
    }
    @Override
    public void savePayable(Payable value) { putDocument(value.tenantId(), "payable", value.id(), value); }

    @Override
    public Page<Payment> payments(String tenantId, FinanceFilter filter) {
        return page(documents(tenantId, "payment", Payment.class).stream()
                .filter(item -> financeMatch(item.status(), null, null, filter,
                        item.docNo(), item.counterpartyName()))
                .sorted(Comparator.comparing(Payment::createdAt).reversed()).toList(), filter);
    }
    @Override
    public Optional<Payment> payment(String tenantId, String id) {
        return document(tenantId, "payment", id, Payment.class);
    }
    @Override
    public void savePayment(Payment value) { putDocument(value.tenantId(), "payment", value.id(), value); }

    @Override
    public Page<Allocation> allocations(String tenantId, FinanceFilter filter) {
        return page(documents(tenantId, "allocation", Allocation.class).stream()
                .filter(item -> financeMatch(item.status(), item.paymentId(), null, filter,
                        item.allocationNo()))
                .sorted(Comparator.comparing(Allocation::createdAt).reversed()).toList(), filter);
    }

    @Override
    public Optional<Allocation> allocation(String tenantId, String id) {
        return document(tenantId, "allocation", id, Allocation.class);
    }

    @Override
    public void saveAllocation(Allocation value) { putDocument(value.tenantId(), "allocation", value.id(), value); }

    @Override
    public Page<Invoice> invoices(String tenantId, FinanceFilter filter) {
        return page(documents(tenantId, "invoice", Invoice.class).stream()
                .filter(item -> financeMatch(item.status(), null, null, filter,
                        item.docNo(), item.counterpartyName(), item.invoiceNo()))
                .sorted(Comparator.comparing(Invoice::createdAt).reversed()).toList(), filter);
    }
    @Override
    public Optional<Invoice> invoice(String tenantId, String id) {
        return document(tenantId, "invoice", id, Invoice.class);
    }
    @Override
    public void saveInvoice(Invoice value) { putDocument(value.tenantId(), "invoice", value.id(), value); }

    @Override
    public Page<Voucher> vouchers(String tenantId, FinanceFilter filter) {
        return page(documents(tenantId, "voucher", Voucher.class).stream()
                .filter(item -> financeMatch(item.status(), item.sourceId(), null, filter,
                        item.docNo(), item.summary()))
                .sorted(Comparator.comparing(Voucher::createdAt).reversed()).toList(), filter);
    }
    @Override
    public Optional<Voucher> voucher(String tenantId, String id) {
        return document(tenantId, "voucher", id, Voucher.class);
    }
    @Override
    public void saveVoucher(Voucher value) { putDocument(value.tenantId(), "voucher", value.id(), value); }

    @Override
    public Page<CostAccounting> costs(String tenantId, FinanceFilter filter) {
        return page(documents(tenantId, "costAccounting", CostAccounting.class).stream()
                .filter(item -> financeMatch(item.status(), null, null, filter,
                        item.docNo(), item.productName(), item.workOrderNo()))
                .sorted(Comparator.comparing(CostAccounting::createdAt).reversed()).toList(), filter);
    }
    @Override
    public Optional<CostAccounting> cost(String tenantId, String id) {
        return document(tenantId, "costAccounting", id, CostAccounting.class);
    }
    @Override
    public void saveCost(CostAccounting value) { putDocument(value.tenantId(), "costAccounting", value.id(), value); }

    private boolean financeMatch(
            String status, String sourceId, String sourceDocNo,
            FinanceFilter filter, String... fields
    ) {
        if (filter == null) return true;
        if (filter.status() != null && !filter.status().equals(status)) return false;
        if (filter.search() != null && !filter.search().isBlank()) {
            boolean matched = java.util.Arrays.stream(fields).filter(Objects::nonNull)
                    .anyMatch(field -> field.toLowerCase().contains(filter.search().toLowerCase()));
            if (!matched) return false;
        }
        return filter.sourceOrder() == null || filter.sourceOrder().equals(sourceDocNo)
                || filter.sourceOrder().equals(sourceId);
    }

    private <T> Page<T> page(List<T> values, FinanceFilter filter) {
        int safePage = filter == null || filter.page() == null || filter.page() < 1 ? 1 : filter.page();
        int safeSize = filter == null || filter.pageSize() == null || filter.pageSize() < 1 ? 20 : filter.pageSize();
        int from = Math.min((safePage - 1) * safeSize, values.size());
        int to = Math.min(from + safeSize, values.size());
        return new Page<>(List.copyOf(values.subList(from, to)), values.size());
    }
}
