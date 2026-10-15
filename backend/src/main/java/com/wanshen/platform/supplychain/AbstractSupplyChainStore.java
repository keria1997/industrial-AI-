package com.wanshen.platform.supplychain;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.wanshen.platform.storage.ModuleInfra.AuditLog;
import com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord;
import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

public interface AbstractSupplyChainStore {
    Set<String> LEVELS = Set.of("低", "中", "高");
    record Page<T>(List<T> items, int total) {}
    record SupplierFilter(Integer page, Integer pageSize, String status, String rating,
                          String riskLevel, String category, Boolean admittance, String owner, String search) {}
    record CustomerFilter(Integer page, Integer pageSize, String status, String exposureLevel,
                          String pressureLevel, String industry, String search) {}
    record RiskFilter(Integer page, Integer pageSize, String status, String riskLevel,
                      String companyType, String owner, String search) {}

    record Supplier(
            String id, String tenantId, String supplierNo, String name, String creditCode,
            String type, String category, String qualification, String rating,
            String riskLevel, String owner, int cooperationCount, String totalAmount,
            boolean admittance, String status, Map<String, Object> metadata, String remark,
            int version, String createdAt, String updatedAt, String createdBy
    ) {}

    record Customer(
            String id, String tenantId, String customerNo, String name, String creditCode,
            String legalRepresentative, String operationStatus, String businessStatus,
            String enterpriseSize, String industry, String revenue, String receivable,
            int overdueDays, String exposureLevel, String pressureLevel, String role,
            List<String> alerts, String status, Map<String, Object> metadata, String remark,
            int version, String createdAt, String updatedAt, String createdBy
    ) {}

    record RiskEvent(
            String id, String tenantId, String riskNo, String companyName, String companyType,
            String riskType, String riskLevel, String owner, String action, String status,
            Map<String, Object> metadata, String remark, int version,
            String createdAt, String updatedAt, String createdBy
    ) {}

    <T> T transaction(java.util.function.Supplier<T> work);

    Page<Supplier> suppliers(String tenantId, SupplierFilter filter);
    Optional<Supplier> supplier(String tenantId, String id);
    Optional<Supplier> supplierByNo(String tenantId, String supplierNo);
    void saveSupplier(Supplier value);
    void deleteSupplier(String tenantId, String id);

    Page<Customer> customers(String tenantId, CustomerFilter filter);
    Optional<Customer> customer(String tenantId, String id);
    Optional<Customer> customerByNo(String tenantId, String customerNo);
    void saveCustomer(Customer value);
    void deleteCustomer(String tenantId, String id);

    Page<RiskEvent> riskEvents(String tenantId, RiskFilter filter);
    Optional<RiskEvent> riskEvent(String tenantId, String id);
    void saveRiskEvent(RiskEvent value);
    void deleteRiskEvent(String tenantId, String id);

    void addOutbox(OutboxEvent event);
    List<OutboxEvent> pendingOutbox(String tenantId);
    List<String> pendingOutboxTenantIds();
    void markOutboxPublished(String tenantId, String eventId);
    void markOutboxFailed(String tenantId, String eventId, String error, int maxAttempts);
    void addAuditLog(AuditLog log);
    Optional<IdempotencyRecord> idempotency(String tenantId, String commandType, String key);
    void saveIdempotency(String tenantId, String commandType, String key,
                         String requestHash, int statusCode, Object body);
}
