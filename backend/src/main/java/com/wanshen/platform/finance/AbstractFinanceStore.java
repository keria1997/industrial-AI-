package com.wanshen.platform.finance;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.wanshen.platform.storage.ModuleInfra.AuditLog;
import com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord;
import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;

import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

public interface AbstractFinanceStore {
    record FinanceFilter(String status, String search, String sourceOrder, Integer page, Integer pageSize) {}
    record Page<T>(List<T> items, int total) {}

    record AllocationLine(
            String documentType, String documentId, String amount
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Allocation(
            String id, String tenantId, String allocationNo, String paymentId,
            String currency, List<AllocationLine> lines, String status,
            String remark, int version, String createdAt, String updatedAt, String createdBy
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Receivable(
            String id, String tenantId, String docNo, String title,
            String customerId, String customerName, String businessType,
            String sourceType, String sourceId,
            @JsonInclude(JsonInclude.Include.NON_NULL) String sourceDocNo,
            String currency, String totalAmount, String receivedAmount, String outstandingAmount,
            String status, @JsonInclude(JsonInclude.Include.NON_NULL) String dueDate,
            @JsonInclude(JsonInclude.Include.NON_NULL) String issuedAt,
            @JsonInclude(JsonInclude.Include.NON_NULL) String settledAt,
            String remark, int version, String createdAt, String updatedAt, String createdBy
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Payable(
            String id, String tenantId, String docNo, String title,
            String supplierId, String supplierName, String businessType,
            String sourceType, String sourceId,
            @JsonInclude(JsonInclude.Include.NON_NULL) String sourceDocNo,
            String currency, String totalAmount, String paidAmount, String outstandingAmount,
            String status, @JsonInclude(JsonInclude.Include.NON_NULL) String dueDate,
            @JsonInclude(JsonInclude.Include.NON_NULL) String issuedAt,
            @JsonInclude(JsonInclude.Include.NON_NULL) String settledAt,
            String remark, int version, String createdAt, String updatedAt, String createdBy
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Payment(
            String id, String tenantId, String docNo, String direction,
            @JsonInclude(JsonInclude.Include.NON_NULL) String receivableId,
            @JsonInclude(JsonInclude.Include.NON_NULL) String payableId,
            String counterpartyId, String counterpartyName, String currency, String amount,
            String paymentMethod, String paymentDate, String bankAccount, String referenceNo,
            String status, String remark, int version, String createdAt, String updatedAt, String createdBy
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Invoice(
            String id, String tenantId, String docNo, String invoiceType,
            @JsonInclude(JsonInclude.Include.NON_NULL) String receivableId,
            @JsonInclude(JsonInclude.Include.NON_NULL) String payableId,
            String counterpartyId, String counterpartyName, String currency, String amount,
            String taxAmount, String taxRate, String invoiceNo,
            @JsonInclude(JsonInclude.Include.NON_NULL) String invoiceDate,
            String status, String remark, int version, String createdAt, String updatedAt, String createdBy
    ) {}

    record VoucherLine(
            String accountCode, String accountName, String debitAmount,
            String creditAmount, String summary
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Voucher(
            String id, String tenantId, String docNo, String voucherType, String summary,
            String totalDebit, String totalCredit, String status,
            @JsonInclude(JsonInclude.Include.NON_NULL) String postingDate,
            List<VoucherLine> lines, String sourceType, String sourceId,
            String remark, int version, String createdAt, String updatedAt, String createdBy
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record CostAccounting(
            String id, String tenantId, String docNo,
            @JsonInclude(JsonInclude.Include.NON_NULL) String workOrderId,
            @JsonInclude(JsonInclude.Include.NON_NULL) String workOrderNo,
            String productId, String productName, String materialCost,
            String manufacturingCost, String laborCost, String totalCost, String outputQty,
            String unitCost, String standardUnitCost, String variancePct, String status,
            String remark, int version, String createdAt, String updatedAt, String createdBy
    ) {}

    <T> T transaction(Supplier<T> work);

    Page<Receivable> receivables(String tenantId, FinanceFilter filter);
    Optional<Receivable> receivable(String tenantId, String id);
    Optional<Receivable> receivableBySource(String tenantId, String sourceType, String sourceId);
    void saveReceivable(Receivable value);

    Page<Payable> payables(String tenantId, FinanceFilter filter);
    Optional<Payable> payable(String tenantId, String id);
    Optional<Payable> payableBySource(String tenantId, String sourceType, String sourceId);
    void savePayable(Payable value);

    Page<Payment> payments(String tenantId, FinanceFilter filter);
    Optional<Payment> payment(String tenantId, String id);
    void savePayment(Payment value);

    Page<Allocation> allocations(String tenantId, FinanceFilter filter);
    Optional<Allocation> allocation(String tenantId, String id);
    void saveAllocation(Allocation value);

    Page<Invoice> invoices(String tenantId, FinanceFilter filter);
    Optional<Invoice> invoice(String tenantId, String id);
    void saveInvoice(Invoice value);

    Page<Voucher> vouchers(String tenantId, FinanceFilter filter);
    Optional<Voucher> voucher(String tenantId, String id);
    void saveVoucher(Voucher value);

    Page<CostAccounting> costs(String tenantId, FinanceFilter filter);
    Optional<CostAccounting> cost(String tenantId, String id);
    void saveCost(CostAccounting value);

    void addOutbox(OutboxEvent event);
    List<OutboxEvent> pendingOutbox(String tenantId);
    List<String> pendingOutboxTenantIds();
    void markOutboxPublished(String tenantId, String eventId);
    void markOutboxFailed(String tenantId, String eventId, String error, int maxAttempts);
    void addAuditLog(AuditLog log);
    Optional<IdempotencyRecord> idempotency(String tenantId, String commandType, String key);
    void saveIdempotency(
            String tenantId, String commandType, String key, String requestHash,
            int statusCode, Object body
    );
}
