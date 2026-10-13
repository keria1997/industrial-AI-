package com.wanshen.platform.finance;

import com.wanshen.platform.storage.ModuleInfra.AuditLog;
import com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord;
import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import java.util.stream.Collectors;

public class FinanceStore implements AbstractFinanceStore {
    private final Map<String, Receivable> receivables = new ConcurrentHashMap<>();
    private final Map<String, Payable> payables = new ConcurrentHashMap<>();
    private final Map<String, Payment> payments = new ConcurrentHashMap<>();
    private final Map<String, Invoice> invoices = new ConcurrentHashMap<>();
    private final Map<String, Voucher> vouchers = new ConcurrentHashMap<>();
    private final Map<String, CostAccounting> costs = new ConcurrentHashMap<>();
    private final Map<String, OutboxEvent> outbox = new ConcurrentHashMap<>();
    private final List<AuditLog> auditLogs = Collections.synchronizedList(new ArrayList<>());
    private final Map<String, IdempotencyRecord> idempotency = new ConcurrentHashMap<>();

    @Override
    public synchronized <T> T transaction(Supplier<T> work) { return work.get(); }

    @Override
    public Page<Receivable> receivables(String tenantId, FinanceFilter filter) {
        return page(receivables.values().stream().filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> matches(item.status(), item.sourceId(), item.sourceDocNo(),
                        filter, item.title(), item.customerName()))
                .sorted(createdDesc(Receivable::createdAt)).collect(Collectors.toList()), filter);
    }
    @Override
    public Optional<Receivable> receivable(String tenantId, String id) {
        return Optional.ofNullable(receivables.get(key(tenantId, id)));
    }
    @Override
    public Optional<Receivable> receivableBySource(String tenantId, String sourceType, String sourceId) {
        return receivables.values().stream().filter(item -> item.tenantId().equals(tenantId)
                && item.sourceType().equals(sourceType) && item.sourceId().equals(sourceId)).findFirst();
    }
    @Override
    public void saveReceivable(Receivable value) { receivables.put(key(value.tenantId(), value.id()), value); }

    @Override
    public Page<Payable> payables(String tenantId, FinanceFilter filter) {
        return page(payables.values().stream().filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> matches(item.status(), item.sourceId(), item.sourceDocNo(),
                        filter, item.title(), item.supplierName()))
                .sorted(createdDesc(Payable::createdAt)).collect(Collectors.toList()), filter);
    }
    @Override
    public Optional<Payable> payable(String tenantId, String id) {
        return Optional.ofNullable(payables.get(key(tenantId, id)));
    }
    @Override
    public Optional<Payable> payableBySource(String tenantId, String sourceType, String sourceId) {
        return payables.values().stream().filter(item -> item.tenantId().equals(tenantId)
                && item.sourceType().equals(sourceType) && item.sourceId().equals(sourceId)).findFirst();
    }
    @Override
    public void savePayable(Payable value) { payables.put(key(value.tenantId(), value.id()), value); }

    @Override
    public Page<Payment> payments(String tenantId, FinanceFilter filter) {
        return page(payments.values().stream().filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> matches(item.status(), null, null,
                        filter, item.counterpartyName()))
                .sorted(createdDesc(Payment::createdAt)).collect(Collectors.toList()), filter);
    }
    @Override
    public Optional<Payment> payment(String tenantId, String id) {
        return Optional.ofNullable(payments.get(key(tenantId, id)));
    }
    @Override
    public void savePayment(Payment value) { payments.put(key(value.tenantId(), value.id()), value); }

    @Override
    public Page<Invoice> invoices(String tenantId, FinanceFilter filter) {
        return page(invoices.values().stream().filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> matches(item.status(), null, null,
                        filter, item.counterpartyName(), item.invoiceNo()))
                .sorted(createdDesc(Invoice::createdAt)).collect(Collectors.toList()), filter);
    }
    @Override
    public Optional<Invoice> invoice(String tenantId, String id) {
        return Optional.ofNullable(invoices.get(key(tenantId, id)));
    }
    @Override
    public void saveInvoice(Invoice value) { invoices.put(key(value.tenantId(), value.id()), value); }

    @Override
    public Page<Voucher> vouchers(String tenantId, FinanceFilter filter) {
        return page(vouchers.values().stream().filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> matches(item.status(), item.sourceId(), null,
                        filter, item.summary()))
                .sorted(createdDesc(Voucher::createdAt)).collect(Collectors.toList()), filter);
    }
    @Override
    public Optional<Voucher> voucher(String tenantId, String id) {
        return Optional.ofNullable(vouchers.get(key(tenantId, id)));
    }
    @Override
    public void saveVoucher(Voucher value) { vouchers.put(key(value.tenantId(), value.id()), value); }

    @Override
    public Page<CostAccounting> costs(String tenantId, FinanceFilter filter) {
        return page(costs.values().stream().filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> matches(item.status(), null, null,
                        filter, item.productName(), item.workOrderNo()))
                .sorted(createdDesc(CostAccounting::createdAt)).collect(Collectors.toList()), filter);
    }
    @Override
    public Optional<CostAccounting> cost(String tenantId, String id) {
        return Optional.ofNullable(costs.get(key(tenantId, id)));
    }
    @Override
    public void saveCost(CostAccounting value) { costs.put(key(value.tenantId(), value.id()), value); }

    @Override
    public void addOutbox(OutboxEvent event) { outbox.put(key(event.tenantId(), event.eventId()), event); }
    @Override
    public synchronized List<OutboxEvent> pendingOutbox(String tenantId) {
        return outbox.values().stream().filter(item -> item.tenantId().equals(tenantId)
                && "PENDING".equals(item.status())).sorted(Comparator.comparing(OutboxEvent::createdAt)).toList();
    }
    @Override
    public synchronized List<String> pendingOutboxTenantIds() {
        return outbox.values().stream().filter(item -> "PENDING".equals(item.status()))
                .map(OutboxEvent::tenantId).distinct().sorted().toList();
    }
    @Override
    public synchronized void markOutboxPublished(String tenantId, String eventId) {
        OutboxEvent item = outbox.get(key(tenantId, eventId));
        if (item == null) return;
        outbox.put(key(tenantId, eventId), new OutboxEvent(item.eventId(), item.tenantId(),
                item.eventType(), item.aggregateType(), item.aggregateId(), item.aggregateVersion(),
                item.correlationId(), item.traceId(), item.payload(), "PUBLISHED", item.attempts() + 1,
                item.lastError(), item.createdAt()));
    }
    @Override
    public synchronized void markOutboxFailed(String tenantId, String eventId, String error, int maxAttempts) {
        OutboxEvent item = outbox.get(key(tenantId, eventId));
        if (item == null) return;
        int attempts = item.attempts() + 1;
        outbox.put(key(tenantId, eventId), new OutboxEvent(item.eventId(), item.tenantId(),
                item.eventType(), item.aggregateType(), item.aggregateId(), item.aggregateVersion(),
                item.correlationId(), item.traceId(), item.payload(),
                attempts >= maxAttempts ? "DEAD_LETTER" : "PENDING", attempts,
                error == null ? item.lastError() : error, item.createdAt()));
    }
    @Override
    public void addAuditLog(AuditLog log) { auditLogs.add(log); }
    @Override
    public Optional<IdempotencyRecord> idempotency(String tenantId, String commandType, String key) {
        return Optional.ofNullable(idempotency.get(idempotencyKey(tenantId, commandType, key)));
    }
    @Override
    public void saveIdempotency(String tenantId, String commandType, String key, String requestHash,
                                int statusCode, Object body) {
        idempotency.put(idempotencyKey(tenantId, commandType, key),
                new IdempotencyRecord(requestHash, statusCode, body));
    }

    private <T> Comparator<T> createdDesc(java.util.function.Function<T, String> value) {
        return Comparator.comparing(value).reversed();
    }

    private boolean matches(
            String status, String sourceId, String sourceDocNo,
            FinanceFilter filter, String... searchFields
    ) {
        if (filter == null) return true;
        if (filter.status() != null && !filter.status().equals(status)) return false;
        if (filter.search() != null && !filter.search().isBlank()) {
            boolean matched = Arrays.stream(searchFields).filter(Objects::nonNull)
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
    private String key(String tenantId, String id) { return tenantId + ":" + id; }
    private String idempotencyKey(String tenantId, String commandType, String key) {
        return tenantId + ":" + commandType + ":" + key;
    }
}
