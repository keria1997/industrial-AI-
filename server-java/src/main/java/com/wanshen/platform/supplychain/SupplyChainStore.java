package com.wanshen.platform.supplychain;

import com.wanshen.platform.storage.ModuleInfra.AuditLog;
import com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord;
import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

public class SupplyChainStore implements AbstractSupplyChainStore {
    private final Map<String, Supplier> suppliers = new ConcurrentHashMap<>();
    private final Map<String, Customer> customers = new ConcurrentHashMap<>();
    private final Map<String, RiskEvent> risks = new ConcurrentHashMap<>();
    private final Map<String, OutboxEvent> outbox = new ConcurrentHashMap<>();
    private final List<AuditLog> auditLogs = Collections.synchronizedList(new ArrayList<>());
    private final Map<String, IdempotencyRecord> idempotency = new ConcurrentHashMap<>();

    @Override
    public synchronized <T> T transaction(java.util.function.Supplier<T> work) { return work.get(); }

    @Override
    public Page<Supplier> suppliers(String tenantId, SupplierFilter filter) {
        List<Supplier> values = suppliers.values().stream().filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> eq(filter.status(), item.status())).filter(item -> eq(filter.rating(), item.rating()))
                .filter(item -> eq(filter.riskLevel(), item.riskLevel()))
                .filter(item -> eq(filter.category(), item.category()))
                .filter(item -> filter.admittance() == null || item.admittance() == filter.admittance())
                .filter(item -> eq(filter.owner(), item.owner()))
                .filter(item -> search(filter.search(), item.supplierNo(), item.name(), item.creditCode(), item.owner()))
                .sorted(createdDesc(Supplier::createdAt)).collect(Collectors.toList());
        return page(values, filter == null ? null : filter.page(), filter == null ? null : filter.pageSize());
    }
    @Override
    public Optional<Supplier> supplier(String tenantId, String id) {
        return Optional.ofNullable(suppliers.get(key(tenantId, id)));
    }
    @Override
    public Optional<Supplier> supplierByNo(String tenantId, String supplierNo) {
        return suppliers.values().stream().filter(item -> item.tenantId().equals(tenantId)
                && item.supplierNo().equals(supplierNo)).findFirst();
    }
    @Override
    public void saveSupplier(Supplier value) { suppliers.put(key(value.tenantId(), value.id()), value); }
    @Override
    public void deleteSupplier(String tenantId, String id) { suppliers.remove(key(tenantId, id)); }

    @Override
    public Page<Customer> customers(String tenantId, CustomerFilter filter) {
        List<Customer> values = customers.values().stream().filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> eq(filter.status(), item.status()))
                .filter(item -> eq(filter.exposureLevel(), item.exposureLevel()))
                .filter(item -> eq(filter.pressureLevel(), item.pressureLevel()))
                .filter(item -> eq(filter.industry(), item.industry()))
                .filter(item -> search(filter.search(), item.customerNo(), item.name(), item.creditCode(),
                        item.legalRepresentative()))
                .sorted(createdDesc(Customer::createdAt)).collect(Collectors.toList());
        return page(values, filter == null ? null : filter.page(), filter == null ? null : filter.pageSize());
    }
    @Override
    public Optional<Customer> customer(String tenantId, String id) {
        return Optional.ofNullable(customers.get(key(tenantId, id)));
    }
    @Override
    public Optional<Customer> customerByNo(String tenantId, String customerNo) {
        return customers.values().stream().filter(item -> item.tenantId().equals(tenantId)
                && item.customerNo().equals(customerNo)).findFirst();
    }
    @Override
    public void saveCustomer(Customer value) { customers.put(key(value.tenantId(), value.id()), value); }
    @Override
    public void deleteCustomer(String tenantId, String id) { customers.remove(key(tenantId, id)); }

    @Override
    public Page<RiskEvent> riskEvents(String tenantId, RiskFilter filter) {
        List<RiskEvent> values = risks.values().stream().filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> eq(filter.status(), item.status())).filter(item -> eq(filter.riskLevel(), item.riskLevel()))
                .filter(item -> eq(filter.companyType(), item.companyType()))
                .filter(item -> eq(filter.owner(), item.owner()))
                .filter(item -> search(filter.search(), item.riskNo(), item.companyName(), item.riskType(), item.owner()))
                .sorted(createdDesc(RiskEvent::createdAt)).collect(Collectors.toList());
        return page(values, filter == null ? null : filter.page(), filter == null ? null : filter.pageSize());
    }
    @Override
    public Optional<RiskEvent> riskEvent(String tenantId, String id) {
        return Optional.ofNullable(risks.get(key(tenantId, id)));
    }
    @Override
    public void saveRiskEvent(RiskEvent value) { risks.put(key(value.tenantId(), value.id()), value); }
    @Override
    public void deleteRiskEvent(String tenantId, String id) { risks.remove(key(tenantId, id)); }

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
        outbox.put(key(tenantId, eventId), new OutboxEvent(item.eventId(), item.tenantId(), item.eventType(),
                item.aggregateType(), item.aggregateId(), item.aggregateVersion(), item.correlationId(),
                item.traceId(), item.payload(), "PUBLISHED", item.attempts(), item.lastError(), item.createdAt()));
    }
    @Override
    public synchronized void markOutboxFailed(String tenantId, String eventId, String error, int maxAttempts) {
        OutboxEvent item = outbox.get(key(tenantId, eventId));
        if (item == null) return;
        int attempts = item.attempts() + 1;
        outbox.put(key(tenantId, eventId), new OutboxEvent(item.eventId(), item.tenantId(), item.eventType(),
                item.aggregateType(), item.aggregateId(), item.aggregateVersion(), item.correlationId(),
                item.traceId(), item.payload(), attempts >= maxAttempts ? "DEAD_LETTER" : "PENDING", attempts,
                error == null ? item.lastError() : error, item.createdAt()));
    }
    @Override
    public void addAuditLog(AuditLog log) { auditLogs.add(log); }
    @Override
    public Optional<IdempotencyRecord> idempotency(String tenantId, String commandType, String key) {
        return Optional.ofNullable(idempotency.get(key(tenantId, commandType, key)));
    }
    @Override
    public void saveIdempotency(String tenantId, String commandType, String key,
                                String requestHash, int statusCode, Object body) {
        idempotency.put(key(tenantId, commandType, key), new IdempotencyRecord(requestHash, statusCode, body));
    }

    private <T> Comparator<T> createdDesc(java.util.function.Function<T, String> function) {
        return Comparator.comparing(function).reversed();
    }
    private boolean eq(String expected, String actual) { return expected == null || expected.equals(actual); }
    private boolean search(String query, String... fields) {
        if (query == null || query.isBlank()) return true;
        return Arrays.stream(fields).filter(Objects::nonNull)
                .anyMatch(field -> field.toLowerCase().contains(query.toLowerCase()));
    }
    private <T> Page<T> page(List<T> values, Integer page, Integer pageSize) {
        int safePage = page == null || page < 1 ? 1 : page;
        int safeSize = pageSize == null || pageSize < 1 ? 20 : pageSize;
        int from = Math.min((safePage - 1) * safeSize, values.size());
        int to = Math.min(from + safeSize, values.size());
        return new Page<>(List.copyOf(values.subList(from, to)), values.size());
    }
    private String key(String... values) { return String.join(":", values); }

}
