package com.wanshen.platform.finance;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.finance.AbstractFinanceStore.CostAccounting;
import com.wanshen.platform.finance.AbstractFinanceStore.Allocation;
import com.wanshen.platform.finance.AbstractFinanceStore.AllocationLine;
import com.wanshen.platform.finance.AbstractFinanceStore.FinanceFilter;
import com.wanshen.platform.finance.AbstractFinanceStore.Invoice;
import com.wanshen.platform.finance.AbstractFinanceStore.Page;
import com.wanshen.platform.finance.AbstractFinanceStore.Payable;
import com.wanshen.platform.finance.AbstractFinanceStore.Payment;
import com.wanshen.platform.finance.AbstractFinanceStore.Receivable;
import com.wanshen.platform.finance.AbstractFinanceStore.Voucher;
import com.wanshen.platform.finance.AbstractFinanceStore.VoucherLine;
import com.wanshen.platform.storage.ModuleInfra.AuditLog;
import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import java.util.function.Supplier;

@RestController
@RequestMapping("/api/v1/finance")
@ConditionalOnProperty(value = "app.finance.native-enabled", havingValue = "true")
public class FinanceController {
    private static final Set<String> PAYMENT_METHODS = Set.of(
            "bank_transfer", "cash", "check", "offset", "other"
    );
    private static final BigDecimal MICRO = new BigDecimal("1000000");

    private final AbstractFinanceStore store;
    private final RequestContextService contexts;
    private final ObjectMapper objectMapper;

    public FinanceController(
            AbstractFinanceStore store, RequestContextService contexts, ObjectMapper objectMapper
    ) {
        this.store = store;
        this.contexts = contexts;
        this.objectMapper = objectMapper;
    }

    record Command(Object body, int status) {}

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(HttpServletRequest request) {
        RequestContext context = requireContext(request, "finance.dashboard.read");
        List<Receivable> receivables = store.receivables(context.tenantId(),
                new FinanceFilter(null, null, null, 1, 1000)).items();
        List<Payable> payables = store.payables(context.tenantId(),
                new FinanceFilter(null, null, null, 1, 1000)).items();
        List<Receivable> activeAr = receivables.stream()
                .filter(item -> Set.of("pending", "processing").contains(item.status())).toList();
        List<Payable> activeAp = payables.stream()
                .filter(item -> Set.of("pending", "processing").contains(item.status())).toList();
        String today = LocalDate.now(ZoneOffset.UTC).toString();
        String month = today.substring(0, 7);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalReceivable", sum(activeAr.stream().map(Receivable::outstandingAmount).toList()));
        result.put("totalPayable", sum(activeAp.stream().map(Payable::outstandingAmount).toList()));
        result.put("totalReceived", sum(receivables.stream().map(Receivable::receivedAmount).toList()));
        result.put("totalPaid", sum(payables.stream().map(Payable::paidAmount).toList()));
        result.put("overdueReceivable", sum(activeAr.stream()
                .filter(item -> item.dueDate() != null && item.dueDate().compareTo(today) < 0)
                .map(Receivable::outstandingAmount).toList()));
        result.put("overduePayable", sum(activeAp.stream()
                .filter(item -> item.dueDate() != null && item.dueDate().compareTo(today) < 0)
                .map(Payable::outstandingAmount).toList()));
        result.put("receivableCount", receivables.size());
        result.put("payableCount", payables.size());
        result.put("pendingSettlementCount", activeAr.size() + activeAp.size());
        result.put("monthlyRevenue", sum(receivables.stream()
                .filter(item -> item.createdAt().substring(0, 7).equals(month))
                .map(Receivable::totalAmount).toList()));
        result.put("monthlyExpenditure", sum(payables.stream()
                .filter(item -> item.createdAt().substring(0, 7).equals(month))
                .map(Payable::totalAmount).toList()));
        return result;
    }

    @GetMapping("/ar-aps")
    public List<Map<String, Object>> arAps(
            HttpServletRequest request,
            @RequestParam(required = false) String partyId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String currency,
            @RequestParam(required = false) String dueDate
    ) {
        RequestContext context = requireContext(request, "finance.receivable.read");
        requireContext(request, "finance.payable.read");
        List<Map<String, Object>> result = new ArrayList<>();
        store.receivables(context.tenantId(), new FinanceFilter(status, null, null, 1, 1000)).items().stream()
                .filter(item -> partyId == null || partyId.equals(item.customerId()))
                .filter(item -> currency == null || currency.equals(item.currency()))
                .filter(item -> dueDate == null || dueDate.equals(item.dueDate()))
                .forEach(item -> result.add(arApItem("RECEIVABLE", item.id(), item.sourceType(),
                        item.sourceId(), item.customerId(), item.customerName(), item.currency(),
                        item.totalAmount(), item.receivedAmount(), item.outstandingAmount(), item.status())));
        store.payables(context.tenantId(), new FinanceFilter(status, null, null, 1, 1000)).items().stream()
                .filter(item -> partyId == null || partyId.equals(item.supplierId()))
                .filter(item -> currency == null || currency.equals(item.currency()))
                .filter(item -> dueDate == null || dueDate.equals(item.dueDate()))
                .forEach(item -> result.add(arApItem("PAYABLE", item.id(), item.sourceType(),
                        item.sourceId(), item.supplierId(), item.supplierName(), item.currency(),
                        item.totalAmount(), item.paidAmount(), item.outstandingAmount(), item.status())));
        return result;
    }

    private Map<String, Object> arApItem(
            String documentType, String financeId, String sourceType, String sourceId,
            String partyId, String partyName, String currency, String totalAmount,
            String allocatedAmount, String outstandingAmount, String status
    ) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("financeId", financeId);
        item.put("documentType", documentType);
        item.put("sourceType", sourceType);
        item.put("sourceId", sourceId);
        item.put("partyId", partyId);
        item.put("partyName", partyName);
        item.put("currency", currency);
        item.put("totalAmount", totalAmount);
        item.put("allocatedAmount", allocatedAmount);
        item.put("outstandingAmount", outstandingAmount);
        item.put("status", status);
        return item;
    }

    @GetMapping("/receivables")
    public Page<Receivable> receivables(
            HttpServletRequest request, @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sourceOrder,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize
    ) {
        RequestContext context = requireContext(request, "finance.receivable.read");
        return store.receivables(context.tenantId(), filter(status, search, sourceOrder, page, pageSize));
    }

    @GetMapping("/receivables/{id}")
    public Receivable receivable(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = requireContext(request, "finance.receivable.read");
        return getReceivable(context.tenantId(), id);
    }

    @PostMapping("/receivables/{id}/settlement")
    public ResponseEntity<?> settleReceivable(
            @PathVariable String id, @RequestBody JsonNode input, HttpServletRequest request
    ) {
        RequestContext context = context(request);
        require(context, "finance.payment.create");
        require(context, "finance.payment.confirm");
        require(context, "finance.invoice.create");
        require(context, "finance.voucher.create");
        require(context, "finance.voucher.post");
        validateSettlement(input);
        return command(context, "finance.receivable.settle", input(id, input), () -> {
            Receivable current = getReceivable(context.tenantId(), id);
            if ("void".equals(current.status())) {
                throw conflict("已作废应收单不能结算", "刷新应收列表后重试");
            }
            if ("done".equals(current.status())) {
                Payment payment = latest(store.payments(context.tenantId(), page()).items().stream()
                        .filter(item -> id.equals(item.receivableId()) && "done".equals(item.status())).toList(), Payment::createdAt);
                Invoice invoice = latest(store.invoices(context.tenantId(), page()).items().stream()
                        .filter(item -> id.equals(item.receivableId()) && "done".equals(item.status())).toList(), Invoice::createdAt);
                Voucher voucher = latest(store.vouchers(context.tenantId(), page()).items().stream()
                        .filter(item -> "Receivable".equals(item.sourceType()) && id.equals(item.sourceId())
                                && "posted".equals(item.status())).toList(), Voucher::createdAt);
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("document", current);
                body.put("payment", payment);
                body.put("invoice", invoice);
                body.put("voucher", voucher);
                body.put("alreadySettled", true);
                return new Command(body, 200);
            }
            if (compare(current.outstandingAmount(), "0") <= 0) {
                throw conflict("应收单没有可结算余额", "刷新应收单后重试");
            }
            String timestamp = now();
            String amount = current.outstandingAmount();
            String received = add(current.receivedAmount(), amount);
            String outstanding = subtract(current.totalAmount(), received);
            String paymentId = UUID.randomUUID().toString();
            String invoiceId = UUID.randomUUID().toString();
            String voucherId = UUID.randomUUID().toString();
            Payment payment = new Payment(paymentId, context.tenantId(), docNo("PAY"), "INBOUND", id,
                    null, current.customerId(), current.customerName(), current.currency(), amount,
                    textOr(input, "paymentMethod", "bank_transfer"), text(input, "paymentDate"), "",
                    textOrEmpty(input, "referenceNo"), "done", textOrEmpty(input, "remark"), 1,
                    timestamp, timestamp, context.actorId());
            Invoice invoice = new Invoice(invoiceId, context.tenantId(), docNo("INV"), "SALES", id, null,
                    current.customerId(), current.customerName(), current.currency(), current.totalAmount(),
                    "0", "0", "", text(input, "paymentDate"), "done", "结算自动开票", 1,
                    timestamp, timestamp, context.actorId());
            Voucher voucher = new Voucher(voucherId, context.tenantId(), docNo("VOU"), "receipt",
                    "应收结算 " + current.docNo(), amount, amount, "posted", text(input, "paymentDate"),
                    lines("INBOUND", amount), "Receivable", id, textOrEmpty(input, "remark"), 1,
                    timestamp, timestamp, context.actorId());
            Receivable updated = new Receivable(current.id(), current.tenantId(), current.docNo(), current.title(),
                    current.customerId(), current.customerName(), current.businessType(), current.sourceType(),
                    current.sourceId(), current.sourceDocNo(), current.currency(), current.totalAmount(), received,
                    outstanding, compare(outstanding, "0") <= 0 ? "done" : "processing", current.dueDate(),
                    current.issuedAt(), compare(outstanding, "0") <= 0 ? timestamp : null, current.remark(),
                    current.version() + 1, current.createdAt(), timestamp, current.createdBy());
            store.savePayment(payment);
            store.saveInvoice(invoice);
            store.saveVoucher(voucher);
            store.saveReceivable(updated);
            audit(context, "Receivable", id, updated.version(), "SETTLE", current,
                    Map.of("receivable", updated, "payment", payment, "invoice", invoice, "voucher", voucher));
            outbox(context, "finance.receivable.settled.v1", "Receivable", id, updated.version(),
                    Map.of("receivableId", id, "paymentId", paymentId, "invoiceId", invoiceId,
                            "voucherId", voucherId, "amount", amount));
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("document", updated);
            body.put("payment", payment);
            body.put("invoice", invoice);
            body.put("voucher", voucher);
            return new Command(body, 201);
        });
    }

    @GetMapping("/payables")
    public Page<Payable> payables(
            HttpServletRequest request, @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sourceOrder,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize
    ) {
        RequestContext context = requireContext(request, "finance.payable.read");
        return store.payables(context.tenantId(), filter(status, search, sourceOrder, page, pageSize));
    }

    @GetMapping("/payables/{id}")
    public Payable payable(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = requireContext(request, "finance.payable.read");
        return getPayable(context.tenantId(), id);
    }

    @PostMapping("/payables/{id}/settlement")
    public ResponseEntity<?> settlePayable(
            @PathVariable String id, @RequestBody JsonNode input, HttpServletRequest request
    ) {
        RequestContext context = context(request);
        require(context, "finance.payment.create");
        require(context, "finance.payment.confirm");
        require(context, "finance.invoice.create");
        require(context, "finance.voucher.create");
        require(context, "finance.voucher.post");
        validateSettlement(input);
        return command(context, "finance.payable.settle", input(id, input), () -> {
            Payable current = getPayable(context.tenantId(), id);
            if ("void".equals(current.status())) throw conflict("已作废应付单不能结算", "刷新应付列表后重试");
            if ("done".equals(current.status())) {
                Payment payment = latest(store.payments(context.tenantId(), page()).items().stream()
                        .filter(item -> id.equals(item.payableId()) && "done".equals(item.status())).toList(), Payment::createdAt);
                Invoice invoice = latest(store.invoices(context.tenantId(), page()).items().stream()
                        .filter(item -> id.equals(item.payableId()) && "done".equals(item.status())).toList(), Invoice::createdAt);
                Voucher voucher = latest(store.vouchers(context.tenantId(), page()).items().stream()
                        .filter(item -> "Payable".equals(item.sourceType()) && id.equals(item.sourceId())
                                && "posted".equals(item.status())).toList(), Voucher::createdAt);
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("document", current);
                body.put("payment", payment);
                body.put("invoice", invoice);
                body.put("voucher", voucher);
                body.put("alreadySettled", true);
                return new Command(body, 200);
            }
            if (compare(current.outstandingAmount(), "0") <= 0) {
                throw conflict("应付单没有可结算余额", "刷新应付单后重试");
            }
            String timestamp = now();
            String amount = current.outstandingAmount();
            String paid = add(current.paidAmount(), amount);
            String outstanding = subtract(current.totalAmount(), paid);
            String paymentId = UUID.randomUUID().toString();
            String invoiceId = UUID.randomUUID().toString();
            String voucherId = UUID.randomUUID().toString();
            Payment payment = new Payment(paymentId, context.tenantId(), docNo("PAY"), "OUTBOUND", null,
                    id, current.supplierId(), current.supplierName(), current.currency(), amount,
                    textOr(input, "paymentMethod", "bank_transfer"), text(input, "paymentDate"), "",
                    textOrEmpty(input, "referenceNo"), "done", textOrEmpty(input, "remark"), 1,
                    timestamp, timestamp, context.actorId());
            Invoice invoice = new Invoice(invoiceId, context.tenantId(), docNo("INV"), "PURCHASE", null,
                    id, current.supplierId(), current.supplierName(), current.currency(), current.totalAmount(),
                    "0", "0", "", text(input, "paymentDate"), "done", "结算自动开票", 1,
                    timestamp, timestamp, context.actorId());
            Voucher voucher = new Voucher(voucherId, context.tenantId(), docNo("VOU"), "payment",
                    "应付结算 " + current.docNo(), amount, amount, "posted", text(input, "paymentDate"),
                    lines("OUTBOUND", amount), "Payable", id, textOrEmpty(input, "remark"), 1,
                    timestamp, timestamp, context.actorId());
            Payable updated = new Payable(current.id(), current.tenantId(), current.docNo(), current.title(),
                    current.supplierId(), current.supplierName(), current.businessType(), current.sourceType(),
                    current.sourceId(), current.sourceDocNo(), current.currency(), current.totalAmount(), paid,
                    outstanding, compare(outstanding, "0") <= 0 ? "done" : "processing", current.dueDate(),
                    current.issuedAt(), compare(outstanding, "0") <= 0 ? timestamp : null, current.remark(),
                    current.version() + 1, current.createdAt(), timestamp, current.createdBy());
            store.savePayment(payment);
            store.saveInvoice(invoice);
            store.saveVoucher(voucher);
            store.savePayable(updated);
            audit(context, "Payable", id, updated.version(), "SETTLE", current,
                    Map.of("payable", updated, "payment", payment, "invoice", invoice, "voucher", voucher));
            outbox(context, "finance.payable.settled.v1", "Payable", id, updated.version(),
                    Map.of("payableId", id, "paymentId", paymentId, "invoiceId", invoiceId,
                            "voucherId", voucherId, "amount", amount));
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("document", updated);
            body.put("payment", payment);
            body.put("invoice", invoice);
            body.put("voucher", voucher);
            return new Command(body, 201);
        });
    }

    @GetMapping("/payments")
    public Page<Payment> payments(
            HttpServletRequest request, @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sourceOrder,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize
    ) {
        RequestContext context = requireContext(request, "finance.payment.read");
        return store.payments(context.tenantId(), filter(status, search, sourceOrder, page, pageSize));
    }

    @GetMapping("/allocations")
    public Page<Allocation> allocations(
            HttpServletRequest request, @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sourceOrder,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize
    ) {
        RequestContext context = requireContext(request, "finance.payment.read");
        return store.allocations(context.tenantId(), filter(status, search, sourceOrder, page, pageSize));
    }

    @PostMapping("/allocations")
    public ResponseEntity<?> createAllocation(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = requireContext(request, "finance.payment.confirm");
        requireText(input, "paymentId", 100);
        JsonNode lines = input.get("lines");
        if (!lines.isArray() || lines.isEmpty()) throw bad("核销明细不能为空", "至少提供一行核销");
        List<AllocationLine> allocationLines = new ArrayList<>();
        BigDecimal[] allocatedTotal = {BigDecimal.ZERO};
        for (JsonNode line : lines) {
            String documentType = text(line, "documentType");
            requireText(line, "documentId", 100);
            decimal(line, "amount");
            if (!Set.of("RECEIVABLE", "PAYABLE").contains(documentType)) {
                throw bad("核销单据类型不合法", "使用 RECEIVABLE 或 PAYABLE");
            }
            allocationLines.add(new AllocationLine(documentType, text(line, "documentId"), text(line, "amount")));
            allocatedTotal[0] = new BigDecimal(add(allocatedTotal[0].toPlainString(), text(line, "amount")));
        }
        return command(context, "finance.allocation.create", input, () -> {
            Payment payment = store.payment(context.tenantId(), text(input, "paymentId"))
                    .orElseThrow(() -> notFound("收付款单不存在", "刷新后重试"));
            if (!"done".equals(payment.status())) {
                throw conflict("只有已确认收付款单可以核销", "先确认收付款单");
            }
            if (compare(allocatedTotal[0].toPlainString(), payment.amount()) > 0) {
                throw bad("核销金额超过收付款金额", "减少核销金额");
            }
            for (AllocationLine line : allocationLines) {
                if ("RECEIVABLE".equals(line.documentType())) {
                    Receivable document = getReceivable(context.tenantId(), line.documentId());
                    if (!document.currency().equals(payment.currency())) throw bad("核销币种不一致", "检查币种");
                    if (compare(line.amount(), document.outstandingAmount()) > 0) {
                        throw bad("应收核销金额超过未收余额", "减少核销金额");
                    }
                    store.saveReceivable(copyReceivable(document,
                            add(document.receivedAmount(), line.amount()),
                            subtract(document.outstandingAmount(), line.amount()), now()));
                } else {
                    Payable document = getPayable(context.tenantId(), line.documentId());
                    if (!document.currency().equals(payment.currency())) throw bad("核销币种不一致", "检查币种");
                    if (compare(line.amount(), document.outstandingAmount()) > 0) {
                        throw bad("应付核销金额超过未付余额", "减少核销金额");
                    }
                    store.savePayable(copyPayable(document,
                            add(document.paidAmount(), line.amount()),
                            subtract(document.outstandingAmount(), line.amount()), now()));
                }
            }
            String timestamp = now();
            Allocation allocation = new Allocation(UUID.randomUUID().toString(), context.tenantId(),
                    docNo("ALLOC"), payment.id(), payment.currency(), allocationLines, "CONFIRMED",
                    textOrEmpty(input, "remark"), 1, timestamp, timestamp, context.actorId());
            store.saveAllocation(allocation);
            audit(context, "Allocation", allocation.id(), 1, "CREATE", null, allocation);
            outbox(context, "finance.allocation.created.v1", "Allocation", allocation.id(), 1,
                    Map.of("allocationId", allocation.id(), "paymentId", payment.id(),
                            "amount", allocatedTotal[0].toPlainString()));
            return new Command(allocation, 201);
        });
    }

    @PostMapping("/payments")
    public ResponseEntity<?> registerPayment(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = requireContext(request, "finance.payment.create");
        validatePayment(input);
        return command(context, "finance.payment.register", input, () -> {
            String direction = text(input, "direction");
            Receivable receivable = null;
            Payable payable = null;
            if ("INBOUND".equals(direction) && input.hasNonNull("receivableId")) {
                receivable = getReceivable(context.tenantId(), input.get("receivableId").asText());
                if (Set.of("done", "void").contains(receivable.status())) {
                    throw conflict("应收单当前状态不允许收款", "刷新数据后重试");
                }
                if (compare(text(input, "amount"), receivable.outstandingAmount()) > 0) {
                    throw bad("收款金额超过未收余额", "减少收款金额");
                }
            }
            if ("OUTBOUND".equals(direction) && input.hasNonNull("payableId")) {
                payable = getPayable(context.tenantId(), input.get("payableId").asText());
                if (Set.of("done", "void").contains(payable.status())) {
                    throw conflict("应付单当前状态不允许付款", "刷新数据后重试");
                }
                if (compare(text(input, "amount"), payable.outstandingAmount()) > 0) {
                    throw bad("付款金额超过未付余额", "减少付款金额");
                }
            }
            String timestamp = now();
            Payment payment = new Payment(UUID.randomUUID().toString(), context.tenantId(), docNo("PAY"),
                    direction, textOrNull(input, "receivableId"), textOrNull(input, "payableId"),
                    text(input, "counterpartyId"), text(input, "counterpartyName"),
                    textOr(input, "currency", "CNY"), text(input, "amount"),
                    text(input, "paymentMethod"), text(input, "paymentDate"),
                    textOrEmpty(input, "bankAccount"), textOrEmpty(input, "referenceNo"), "pending",
                    textOrEmpty(input, "remark"), 1, timestamp, timestamp, context.actorId());
            store.savePayment(payment);
            audit(context, "Payment", payment.id(), 1, "REGISTER", null, payment);
            outbox(context, "finance.payment.registered.v1", "Payment", payment.id(), 1,
                    Map.of("paymentId", payment.id(), "direction", direction, "amount", payment.amount()));
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("payment", payment);
            body.put("receivable", receivable);
            body.put("payable", payable);
            return new Command(body, 201);
        });
    }

    @PostMapping("/payments/{id}/confirm")
    public ResponseEntity<?> confirmPayment(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = requireContext(request, "finance.payment.confirm");
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("id", id);
        input.put("version", context.expectedVersion());
        return command(context, "finance.payment.confirm", input, () -> {
            Payment current = store.payment(context.tenantId(), id)
                    .orElseThrow(() -> notFound("收付款单不存在", "刷新列表后重试"));
            requireVersion(context, current.version());
            if (!"pending".equals(current.status())) {
                throw conflict("收付款单当前状态不允许确认", "刷新数据后重试");
            }
            String timestamp = now();
            Payment payment = new Payment(current.id(), current.tenantId(), current.docNo(), current.direction(),
                    current.receivableId(), current.payableId(), current.counterpartyId(), current.counterpartyName(),
                    current.currency(), current.amount(), current.paymentMethod(), current.paymentDate(),
                    current.bankAccount(), current.referenceNo(), "done", current.remark(),
                    current.version() + 1, current.createdAt(), timestamp, current.createdBy());
            store.savePayment(payment);
            Receivable receivable = null;
            Payable payable = null;
            if ("INBOUND".equals(current.direction()) && current.receivableId() != null) {
                Optional<Receivable> found = store.receivable(context.tenantId(), current.receivableId());
                if (found.isPresent()) {
                    Receivable item = found.get();
                    String received = add(item.receivedAmount(), current.amount());
                    String outstanding = subtract(item.totalAmount(), received);
                    boolean done = compare(outstanding, "0") <= 0;
                    receivable = new Receivable(item.id(), item.tenantId(), item.docNo(), item.title(),
                            item.customerId(), item.customerName(), item.businessType(), item.sourceType(),
                            item.sourceId(), item.sourceDocNo(), item.currency(), item.totalAmount(), received,
                            outstanding, done ? "done" : "processing", item.dueDate(), item.issuedAt(),
                            done ? timestamp : item.settledAt(), item.remark(), item.version() + 1,
                            item.createdAt(), timestamp, item.createdBy());
                    store.saveReceivable(receivable);
                }
            }
            if ("OUTBOUND".equals(current.direction()) && current.payableId() != null) {
                Optional<Payable> found = store.payable(context.tenantId(), current.payableId());
                if (found.isPresent()) {
                    Payable item = found.get();
                    String paid = add(item.paidAmount(), current.amount());
                    String outstanding = subtract(item.totalAmount(), paid);
                    boolean done = compare(outstanding, "0") <= 0;
                    payable = new Payable(item.id(), item.tenantId(), item.docNo(), item.title(),
                            item.supplierId(), item.supplierName(), item.businessType(), item.sourceType(),
                            item.sourceId(), item.sourceDocNo(), item.currency(), item.totalAmount(), paid,
                            outstanding, done ? "done" : "processing", item.dueDate(), item.issuedAt(),
                            done ? timestamp : item.settledAt(), item.remark(), item.version() + 1,
                            item.createdAt(), timestamp, item.createdBy());
                    store.savePayable(payable);
                }
            }
            audit(context, "Payment", id, payment.version(), "CONFIRM", current, payment);
            outbox(context, "finance.payment.confirmed.v1", "Payment", id, payment.version(),
                    Map.of("paymentId", id, "amount", payment.amount()));
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("payment", payment);
            body.put("receivable", receivable);
            body.put("payable", payable);
            return new Command(body, 200);
        });
    }

    @PostMapping("/finance-documents/{id}/reverse")
    public ResponseEntity<?> reverseFinanceDocument(
            @PathVariable String id, @RequestBody JsonNode input, HttpServletRequest request
    ) {
        RequestContext context = requireContext(request, "finance.reversal.create");
        requireText(input, "reason", 500);
        requireText(input, "approverToken", 200);
        return command(context, "finance.document.reverse", input(id, input), () -> {
            Optional<Payment> payment = store.payment(context.tenantId(), id);
            if (payment.isPresent()) return new Command(reversePayment(context, payment.get(), text(input, "reason")), 201);
            Optional<Receivable> receivable = store.receivable(context.tenantId(), id);
            if (receivable.isPresent()) return new Command(reverseReceivable(context, receivable.get(), text(input, "reason")), 201);
            Optional<Payable> payable = store.payable(context.tenantId(), id);
            if (payable.isPresent()) return new Command(reversePayable(context, payable.get(), text(input, "reason")), 201);
            Optional<Voucher> voucher = store.voucher(context.tenantId(), id);
            if (voucher.isPresent()) return new Command(reverseVoucher(context, voucher.get(), text(input, "reason")), 201);
            throw notFound("财务单据不存在", "刷新后重试");
        });
    }

    private Map<String, Object> reversePayment(RequestContext context, Payment current, String reason) {
        if ("reversed".equals(current.status())) throw conflict("收付款单已冲销", "刷新后重试");
        String timestamp = now();
        String direction = "INBOUND".equals(current.direction()) ? "OUTBOUND" : "INBOUND";
        Payment reversal = new Payment(UUID.randomUUID().toString(), current.tenantId(), docNo("REV"), direction,
                current.receivableId(), current.payableId(), current.counterpartyId(), current.counterpartyName(),
                current.currency(), current.amount(), current.paymentMethod(),
                LocalDate.now(ZoneOffset.UTC).toString(), "", docNo("REVREF"), "done",
                "冲销：" + reason, 1, timestamp, timestamp, context.actorId());
        Payment reversed = new Payment(current.id(), current.tenantId(), current.docNo(), current.direction(),
                current.receivableId(), current.payableId(), current.counterpartyId(), current.counterpartyName(),
                current.currency(), current.amount(), current.paymentMethod(), current.paymentDate(),
                current.bankAccount(), current.referenceNo(), "reversed", current.remark(),
                current.version() + 1, current.createdAt(), timestamp, current.createdBy());
        store.savePayment(reversal);
        store.savePayment(reversed);
        if ("done".equals(reversed.status())) {
            BigDecimal amount = new BigDecimal(current.amount());
            if ("INBOUND".equals(current.direction()) && current.receivableId() != null) {
                store.receivable(context.tenantId(), current.receivableId()).ifPresent(item -> store.saveReceivable(
                        copyReceivable(item, subtract(item.receivedAmount(), current.amount()),
                                add(item.outstandingAmount(), current.amount()), timestamp)));
            }
            if ("OUTBOUND".equals(current.direction()) && current.payableId() != null) {
                store.payable(context.tenantId(), current.payableId()).ifPresent(item -> store.savePayable(
                        copyPayable(item, subtract(item.paidAmount(), current.amount()),
                                add(item.outstandingAmount(), current.amount()), timestamp)));
            }
        }
        audit(context, "Payment", reversal.id(), 1, "REVERSE", current, reversal);
        outbox(context, "finance.payment.reversed.v1", "Payment", reversal.id(), 1,
                Map.of("reverseFinanceId", reversal.id(), "originalFinanceId", current.id(),
                        "amount", current.amount()));
        return Map.of("reverseFinanceId", reversal.id(), "originalFinanceId", current.id(), "status", "REVERSED");
    }

    private Map<String, Object> reverseReceivable(RequestContext context, Receivable current, String reason) {
        if (Set.of("reversed", "void").contains(current.status())) throw conflict("应收单已冲销或作废", "刷新后重试");
        String timestamp = now();
        String amount = "-" + current.outstandingAmount();
        Receivable reversal = new Receivable(UUID.randomUUID().toString(), current.tenantId(), docNo("ARREV"),
                "冲销 " + current.title(), current.customerId(), current.customerName(), current.businessType(),
                "Reversal", current.id(), current.docNo(), current.currency(), amount, "0", amount,
                "reversed", null, null, null, "冲销：" + reason, 1, timestamp, timestamp, context.actorId());
        Receivable reversed = new Receivable(current.id(), current.tenantId(), current.docNo(), current.title(),
                current.customerId(), current.customerName(), current.businessType(), current.sourceType(),
                current.sourceId(), current.sourceDocNo(), current.currency(), current.totalAmount(),
                current.receivedAmount(), current.outstandingAmount(), "reversed", current.dueDate(),
                current.issuedAt(), current.settledAt(), current.remark(), current.version() + 1,
                current.createdAt(), timestamp, current.createdBy());
        store.saveReceivable(reversal);
        store.saveReceivable(reversed);
        audit(context, "Receivable", reversal.id(), 1, "REVERSE", current, reversal);
        outbox(context, "finance.receivable.reversed.v1", "Receivable", reversal.id(), 1,
                Map.of("reverseFinanceId", reversal.id(), "originalFinanceId", current.id()));
        return Map.of("reverseFinanceId", reversal.id(), "originalFinanceId", current.id(), "status", "REVERSED");
    }

    private Map<String, Object> reversePayable(RequestContext context, Payable current, String reason) {
        if (Set.of("reversed", "void").contains(current.status())) throw conflict("应付单已冲销或作废", "刷新后重试");
        String timestamp = now();
        String amount = "-" + current.outstandingAmount();
        Payable reversal = new Payable(UUID.randomUUID().toString(), current.tenantId(), docNo("APREV"),
                "冲销 " + current.title(), current.supplierId(), current.supplierName(), current.businessType(),
                "Reversal", current.id(), current.docNo(), current.currency(), amount, "0", amount,
                "reversed", null, null, null, "冲销：" + reason, 1, timestamp, timestamp, context.actorId());
        Payable reversed = new Payable(current.id(), current.tenantId(), current.docNo(), current.title(),
                current.supplierId(), current.supplierName(), current.businessType(), current.sourceType(),
                current.sourceId(), current.sourceDocNo(), current.currency(), current.totalAmount(),
                current.paidAmount(), current.outstandingAmount(), "reversed", current.dueDate(),
                current.issuedAt(), current.settledAt(), current.remark(), current.version() + 1,
                current.createdAt(), timestamp, current.createdBy());
        store.savePayable(reversal);
        store.savePayable(reversed);
        audit(context, "Payable", reversal.id(), 1, "REVERSE", current, reversal);
        outbox(context, "finance.payable.reversed.v1", "Payable", reversal.id(), 1,
                Map.of("reverseFinanceId", reversal.id(), "originalFinanceId", current.id()));
        return Map.of("reverseFinanceId", reversal.id(), "originalFinanceId", current.id(), "status", "REVERSED");
    }

    private Map<String, Object> reverseVoucher(RequestContext context, Voucher current, String reason) {
        if ("reversed".equals(current.status())) throw conflict("凭证已冲销", "刷新后重试");
        String timestamp = now();
        List<VoucherLine> reversalLines = current.lines().stream().map(line -> new VoucherLine(
                line.accountCode(), line.accountName(), line.creditAmount(), line.debitAmount(),
                "冲销：" + line.summary())).toList();
        Voucher reversal = new Voucher(UUID.randomUUID().toString(), current.tenantId(), docNo("VOUREV"),
                current.voucherType(), "冲销 " + current.summary(), current.totalCredit(), current.totalDebit(),
                "posted", current.postingDate(), reversalLines, "Reversal", current.id(),
                "冲销：" + reason, 1, timestamp, timestamp, context.actorId());
        Voucher reversed = new Voucher(current.id(), current.tenantId(), current.docNo(), current.voucherType(),
                current.summary(), current.totalDebit(), current.totalCredit(), "reversed", current.postingDate(),
                current.lines(), current.sourceType(), current.sourceId(), current.remark(),
                current.version() + 1, current.createdAt(), timestamp, current.createdBy());
        store.saveVoucher(reversal);
        store.saveVoucher(reversed);
        audit(context, "Voucher", reversal.id(), 1, "REVERSE", current, reversal);
        outbox(context, "finance.voucher.reversed.v1", "Voucher", reversal.id(), 1,
                Map.of("reverseFinanceId", reversal.id(), "originalFinanceId", current.id()));
        return Map.of("reverseFinanceId", reversal.id(), "originalFinanceId", current.id(), "status", "REVERSED");
    }

    @GetMapping("/invoices")
    public Page<Invoice> invoices(
            HttpServletRequest request, @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sourceOrder,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize
    ) {
        RequestContext context = requireContext(request, "finance.invoice.read");
        return store.invoices(context.tenantId(), filter(status, search, sourceOrder, page, pageSize));
    }

    @PostMapping("/invoices")
    public ResponseEntity<?> createInvoice(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = requireContext(request, "finance.invoice.create");
        requireEnum(input, "invoiceType", Set.of("SALES", "PURCHASE"));
        requireText(input, "counterpartyId", 200);
        requireText(input, "counterpartyName", 200);
        decimal(input, "amount");
        decimal(input, "taxRate");
        optionalDate(input, "invoiceDate");
        optionalText(input, "invoiceNo", 100);
        optionalText(input, "remark", 500);
        return command(context, "finance.invoice.create", input, () -> {
            String timestamp = now();
            String amount = text(input, "amount");
            String taxRate = text(input, "taxRate");
            String taxAmount = multiplyScaled(amount, taxRate).multiply(MICRO)
                    .setScale(0, RoundingMode.DOWN).divide(MICRO, 6, RoundingMode.DOWN).toPlainString();
            Invoice invoice = new Invoice(UUID.randomUUID().toString(), context.tenantId(), docNo("INV"),
                    text(input, "invoiceType"), textOrNull(input, "receivableId"),
                    textOrNull(input, "payableId"), text(input, "counterpartyId"),
                    text(input, "counterpartyName"), "CNY", amount, taxAmount, taxRate,
                    textOrEmpty(input, "invoiceNo"), textOrNull(input, "invoiceDate"), "pending",
                    textOrEmpty(input, "remark"), 1, timestamp, timestamp, context.actorId());
            store.saveInvoice(invoice);
            audit(context, "Invoice", invoice.id(), 1, "CREATE", null, invoice);
            return new Command(invoice, 201);
        });
    }

    @GetMapping("/vouchers")
    public Page<Voucher> vouchers(
            HttpServletRequest request, @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sourceOrder,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize
    ) {
        RequestContext context = requireContext(request, "finance.voucher.read");
        return store.vouchers(context.tenantId(), filter(status, search, sourceOrder, page, pageSize));
    }

    @PostMapping("/vouchers")
    public ResponseEntity<?> createVoucher(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = requireContext(request, "finance.voucher.create");
        requireEnum(input, "voucherType", Set.of("general", "receipt", "payment", "transfer"));
        requireText(input, "summary", 500);
        optionalDate(input, "postingDate");
        JsonNode lines = input.get("lines");
        if (!lines.isArray() || lines.size() < 2) throw bad("凭证分录不合法", "至少提供两行分录");
        List<VoucherLine> entries = new ArrayList<>();
        for (JsonNode item : lines) {
            requireRange(item.get("accountCode").asText(), 1, 50);
            requireRange(item.get("accountName").asText(), 1, 200);
            decimalValue(item.get("debitAmount").asText());
            decimalValue(item.get("creditAmount").asText());
            if (item.hasNonNull("summary") && item.get("summary").asText().length() > 200) {
                throw bad("summary 不合法", "检查请求字段后重试");
            }
            entries.add(new VoucherLine(item.get("accountCode").asText(), item.get("accountName").asText(),
                    item.get("debitAmount").asText(), item.get("creditAmount").asText(),
                    item.hasNonNull("summary") ? item.get("summary").asText() : ""));
        }
        optionalText(input, "sourceType", 100);
        optionalText(input, "sourceId", 100);
        optionalText(input, "remark", 500);
        return command(context, "finance.voucher.create", input, () -> {
            String timestamp = now();
            String debit = sum(entries.stream().map(VoucherLine::debitAmount).toList());
            String credit = sum(entries.stream().map(VoucherLine::creditAmount).toList());
            if (compare(debit, credit) != 0) throw bad("凭证借贷不平衡", "检查借方和贷方金额");
            Voucher voucher = new Voucher(UUID.randomUUID().toString(), context.tenantId(), docNo("VOU"),
                    text(input, "voucherType"), text(input, "summary"), debit, credit, "draft",
                    textOrNull(input, "postingDate"), entries, textOrEmpty(input, "sourceType"),
                    textOrEmpty(input, "sourceId"), textOrEmpty(input, "remark"), 1, timestamp,
                    timestamp, context.actorId());
            store.saveVoucher(voucher);
            audit(context, "Voucher", voucher.id(), 1, "CREATE", null, voucher);
            return new Command(voucher, 201);
        });
    }

    @PostMapping("/vouchers/{id}/post")
    public ResponseEntity<?> postVoucher(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = requireContext(request, "finance.voucher.post");
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("id", id);
        input.put("version", context.expectedVersion());
        return command(context, "finance.voucher.post", input, () -> {
            Voucher current = store.voucher(context.tenantId(), id)
                    .orElseThrow(() -> notFound("凭证不存在", "刷新列表后重试"));
            requireVersion(context, current.version());
            if (!"draft".equals(current.status())) throw conflict("凭证当前状态不允许过账", "刷新数据后重试");
            String timestamp = now();
            Voucher updated = new Voucher(current.id(), current.tenantId(), current.docNo(),
                    current.voucherType(), current.summary(), current.totalDebit(), current.totalCredit(),
                    "posted", current.postingDate() == null ? LocalDate.now(ZoneOffset.UTC).toString()
                    : current.postingDate(), current.lines(), current.sourceType(), current.sourceId(),
                    current.remark(), current.version() + 1, current.createdAt(), timestamp,
                    current.createdBy());
            store.saveVoucher(updated);
            audit(context, "Voucher", id, updated.version(), "POST", current, updated);
            return new Command(updated, 200);
        });
    }

    @GetMapping("/cost-accounting")
    public Page<CostAccounting> costs(
            HttpServletRequest request, @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sourceOrder,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize
    ) {
        RequestContext context = requireContext(request, "finance.cost.read");
        return store.costs(context.tenantId(), filter(status, search, sourceOrder, page, pageSize));
    }

    @PostMapping("/cost-accounting")
    public ResponseEntity<?> createCost(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = requireContext(request, "finance.cost.create");
        requireText(input, "productId", 200);
        requireText(input, "productName", 200);
        decimal(input, "materialCost");
        decimal(input, "manufacturingCost");
        decimal(input, "laborCost");
        decimal(input, "outputQty");
        decimal(input, "standardUnitCost");
        optionalText(input, "workOrderId", 100);
        optionalText(input, "workOrderNo", 100);
        optionalText(input, "remark", 500);
        return command(context, "finance.cost.create", input, () -> {
            if (compare(text(input, "outputQty"), "0") <= 0) {
                throw bad("产出数量必须大于 0", "修正产出数量");
            }
            String timestamp = now();
            String totalCost = add(add(text(input, "materialCost"), text(input, "manufacturingCost")),
                    text(input, "laborCost"));
            BigDecimal output = new BigDecimal(text(input, "outputQty"));
            String unitCost = new BigDecimal(totalCost).divide(output, 6, RoundingMode.DOWN).toPlainString();
            BigDecimal standard = new BigDecimal(text(input, "standardUnitCost"));
            BigDecimal unit = new BigDecimal(unitCost);
            String variance = standard.compareTo(BigDecimal.ZERO) > 0
                    ? unit.subtract(standard).divide(standard, 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP).toPlainString()
                    : "0";
            CostAccounting cost = new CostAccounting(UUID.randomUUID().toString(), context.tenantId(),
                    docNo("CST"), textOrNull(input, "workOrderId"), textOrNull(input, "workOrderNo"),
                    text(input, "productId"), text(input, "productName"), text(input, "materialCost"),
                    text(input, "manufacturingCost"), text(input, "laborCost"), totalCost,
                    text(input, "outputQty"), unitCost, text(input, "standardUnitCost"), variance,
                    "pending", textOrEmpty(input, "remark"), 1, timestamp, timestamp, context.actorId());
            store.saveCost(cost);
            audit(context, "CostAccounting", cost.id(), 1, "CREATE", null, cost);
            return new Command(cost, 201);
        });
    }

    private ResponseEntity<?> command(
            RequestContext context, String type, Object input, Supplier<Command> work
    ) {
        if (context.idempotencyKey() == null || context.idempotencyKey().isBlank()) {
            throw bad("写操作缺少幂等键", "提供 X-Idempotency-Key 后重试");
        }
        String hash = hash(input);
        return store.transaction(() -> {
            Optional<com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord> replay =
                    store.idempotency(context.tenantId(), type, context.idempotencyKey());
            if (replay.isPresent()) {
                if (!replay.get().requestHash().equals(hash)) {
                    throw conflict("幂等键已用于不同请求", "为新业务操作使用新的幂等键");
                }
                return ResponseEntity.status(replay.get().statusCode())
                        .header("X-Trace-Id", context.traceId())
                        .header("X-Idempotent-Replay", "true")
                        .body(replay.get().body());
            }
            Command result = work.get();
            store.saveIdempotency(context.tenantId(), type, context.idempotencyKey(), hash,
                    result.status(), result.body());
            return ResponseEntity.status(result.status()).header("X-Trace-Id", context.traceId()).body(result.body());
        });
    }

    private FinanceFilter filter(String status, String search, String sourceOrder, Integer page, Integer pageSize) {
        return new FinanceFilter(status, search, sourceOrder, page, pageSize);
    }
    private FinanceFilter page() { return new FinanceFilter(null, null, null, 1, 200); }
    private void validateSettlement(JsonNode input) {
        requireEnum(input, "paymentMethod", PAYMENT_METHODS);
        requireDate(input, "paymentDate");
        optionalText(input, "referenceNo", 200);
        optionalText(input, "remark", 500);
    }
    private void validatePayment(JsonNode input) {
        requireEnum(input, "direction", Set.of("INBOUND", "OUTBOUND"));
        optionalText(input, "receivableId", 100);
        optionalText(input, "payableId", 100);
        requireText(input, "counterpartyId", 200);
        requireText(input, "counterpartyName", 200);
        decimal(input, "amount");
        requireEnum(input, "paymentMethod", PAYMENT_METHODS);
        requireDate(input, "paymentDate");
        optionalText(input, "currency", 10);
        optionalText(input, "bankAccount", 200);
        optionalText(input, "referenceNo", 200);
        optionalText(input, "remark", 500);
    }
    private void require(RequestContext context, String permission) {
        if (!context.has(permission)) {
            throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED",
                    "缺少操作权限：" + permission, "请联系管理员授予对应财务权限");
        }
    }
    private void requireVersion(RequestContext context, int actual) {
        if (context.expectedVersion() == null) throw versionConflict(Map.of("actualVersion", actual));
        if (context.expectedVersion() != actual) throw versionConflict(Map.of(
                "expectedVersion", context.expectedVersion(), "actualVersion", actual
        ));
    }
    private void audit(RequestContext context, String aggregateType, String aggregateId,
                       int version, String action, Object before, Object after) {
        store.addAuditLog(new AuditLog(UUID.randomUUID().toString(), context.tenantId(), aggregateType,
                aggregateId, version, action, context.actorId(), before, after,
                UUID.randomUUID().toString(), context.traceId(), now()));
    }
    private void outbox(RequestContext context, String eventType, String aggregateType,
                        String aggregateId, int version, Map<String, Object> payload) {
        store.addOutbox(new OutboxEvent(UUID.randomUUID().toString(), context.tenantId(), eventType,
                aggregateType, aggregateId, version, "", context.traceId(), payload, "PENDING", 0, "", now()));
    }
    private RequestContext requireContext(HttpServletRequest request, String permission) {
        RequestContext context = context(request);
        require(context, permission);
        return context;
    }
    private <T> T latest(List<T> values, java.util.function.Function<T, String> timestamp) {
        return values.stream().max(Comparator.comparing(timestamp)).orElse(null);
    }
    private List<VoucherLine> lines(String direction, String amount) {
        if ("INBOUND".equals(direction)) {
            return List.of(new VoucherLine("1002", "银行存款", amount, "0", "客户回款"),
                    new VoucherLine("1122", "应收账款", "0", amount, "应收核销"));
        }
        return List.of(new VoucherLine("2202", "应付账款", amount, "0", "应付核销"),
                new VoucherLine("1002", "银行存款", "0", amount, "供应商付款"));
    }
    private String add(String... values) {
        BigDecimal result = BigDecimal.ZERO;
        for (String value : values) result = result.add(scaled(value));
        return unscaled(result);
    }
    private String sum(List<String> values) { return add(values.toArray(String[]::new)); }
    private String subtract(String left, String right) { return unscaled(scaled(left).subtract(scaled(right))); }
    private int compare(String left, String right) { return scaled(left).compareTo(scaled(right)); }
    private BigDecimal scaled(String value) { return new BigDecimal(value).setScale(6, RoundingMode.UNNECESSARY); }
    private String unscaled(BigDecimal value) {
        return value.setScale(6, RoundingMode.UNNECESSARY).stripTrailingZeros().toPlainString();
    }
    private BigDecimal multiplyScaled(String left, String right) {
        return new BigDecimal(left).multiply(new BigDecimal(right)).setScale(6, RoundingMode.HALF_UP);
    }
    private BigDecimal divideScaled(BigDecimal left, BigDecimal right) {
        return left.divide(right, 6, RoundingMode.DOWN);
    }
    private void decimal(JsonNode input, String field) { decimalValue(text(input, field)); }
    private void decimalValue(String value) {
        if (value == null || !value.matches("^(0|[1-9]\\d*)(\\.\\d{1,6})?$")) {
            throw bad("金额格式不合法", "使用最多 6 位小数的非负十进制字符串");
        }
    }
    private void requireDate(JsonNode input, String field) {
        if (!input.hasNonNull(field) || !input.get(field).asText().matches("^\\d{4}-\\d{2}-\\d{2}$")) {
            throw bad(field + " 不合法", "必须使用 YYYY-MM-DD");
        }
    }
    private void optionalDate(JsonNode input, String field) {
        if (input.hasNonNull(field) && !input.get(field).asText().matches("^\\d{4}-\\d{2}-\\d{2}$")) {
            throw bad(field + " 不合法", "必须使用 YYYY-MM-DD");
        }
    }
    private void requireEnum(JsonNode input, String field, Set<String> values) {
        if (!input.hasNonNull(field) || !values.contains(input.get(field).asText())) {
            throw bad(field + " 不合法", "检查请求字段后重试");
        }
    }
    private void requireText(JsonNode input, String field, int maxLength) {
        if (!input.hasNonNull(field)) throw bad(field + " 不合法", "检查请求字段后重试");
        requireRange(input.get(field).asText(), 1, maxLength);
    }
    private void optionalText(JsonNode input, String field, int maxLength) {
        if (input.hasNonNull(field) && input.get(field).asText().length() > maxLength) {
            throw bad(field + " 不合法", "检查请求字段后重试");
        }
    }
    private void requireRange(String value, int min, int max) {
        if (value == null || value.length() < min || value.length() > max) {
            throw bad("请求字段不符合规则", "检查请求字段后重试");
        }
    }
    private String text(JsonNode input, String field) { return input.get(field).asText(); }
    private String textOr(JsonNode input, String field, String fallback) {
        return input.hasNonNull(field) ? input.get(field).asText() : fallback;
    }
    private String textOrEmpty(JsonNode input, String field) { return textOr(input, field, ""); }
    private String textOrNull(JsonNode input, String field) {
        return input.hasNonNull(field) ? input.get(field).asText() : null;
    }
    private Map<String, Object> input(String id, JsonNode input) {
        Map<String, Object> result = objectMapper.convertValue(input, new TypeReference<Map<String, Object>>() {});
        result.put("id", id);
        return result;
    }
    private String hash(Object value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(objectMapper.writeValueAsBytes(value)));
        } catch (Exception exception) { throw new IllegalStateException(exception); }
    }
    private String docNo(String prefix) {
        return prefix + "-" + LocalDate.now(ZoneOffset.UTC).toString().replace("-", "")
                + "-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
    }
    private String now() { return java.time.Instant.now().toString(); }
    private Receivable getReceivable(String tenantId, String id) {
        return store.receivable(tenantId, id).orElseThrow(() ->
                notFound("应收单不存在或不在当前数据范围内", "请刷新列表并确认租户与数据权限"));
    }
    private Payable getPayable(String tenantId, String id) {
        return store.payable(tenantId, id).orElseThrow(() ->
                notFound("应付单不存在或不在当前数据范围内", "请刷新列表并确认租户与数据权限"));
    }

    private Receivable copyReceivable(Receivable item, String received, String outstanding, String timestamp) {
        boolean done = compare(outstanding, "0") <= 0;
        return new Receivable(item.id(), item.tenantId(), item.docNo(), item.title(), item.customerId(),
                item.customerName(), item.businessType(), item.sourceType(), item.sourceId(), item.sourceDocNo(),
                item.currency(), item.totalAmount(), received, outstanding, done ? "done" : "processing",
                item.dueDate(), item.issuedAt(), done ? timestamp : item.settledAt(), item.remark(),
                item.version() + 1, item.createdAt(), timestamp, item.createdBy());
    }

    private Payable copyPayable(Payable item, String paid, String outstanding, String timestamp) {
        boolean done = compare(outstanding, "0") <= 0;
        return new Payable(item.id(), item.tenantId(), item.docNo(), item.title(), item.supplierId(),
                item.supplierName(), item.businessType(), item.sourceType(), item.sourceId(), item.sourceDocNo(),
                item.currency(), item.totalAmount(), paid, outstanding, done ? "done" : "processing",
                item.dueDate(), item.issuedAt(), done ? timestamp : item.settledAt(), item.remark(),
                item.version() + 1, item.createdAt(), timestamp, item.createdBy());
    }

    private RequestContext context(HttpServletRequest request) { return contexts.from(request); }
    private ApiException bad(String message, String suggestion) {
        return new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", message, suggestion);
    }
    private ApiException conflict(String message, String suggestion) {
        return new ApiException(409, "PRODUCTION_409_ILLEGAL_STATE", message, suggestion);
    }
    private ApiException versionConflict(Map<String, Object> details) {
        return new ApiException(409, "PRODUCTION_409_VERSION_CONFLICT", "数据已被其他操作更新",
                "刷新数据后重新确认操作", List.of(), details);
    }
    private ApiException notFound(String message, String suggestion) {
        return new ApiException(404, "PRODUCTION_404_NOT_FOUND", message, suggestion);
    }
}
