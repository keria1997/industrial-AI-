package com.wanshen.platform.finance;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.wanshen.platform.finance.AbstractFinanceStore.CostAccounting;
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
    private static final Logger log = LoggerFactory.getLogger(FinanceController.class);
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
            @PathVariable String id, @RequestBody @jakarta.validation.Valid com.wanshen.platform.finance.dto.SettlementRequest input, HttpServletRequest request
    ) {
        var inputJson = objectMapper.valueToTree(input);
        RequestContext context = context(request);
        require(context, "finance.payment.create");
        require(context, "finance.payment.confirm");
        require(context, "finance.invoice.create");
        require(context, "finance.voucher.create");
        require(context, "finance.voucher.post");
        validateSettlement(inputJson);
        log.info("[财务管理] AR结算 | 单据: {} | 租户: {}", id, context.tenantId());
        return command(context, "finance.receivable.settle", input(id, inputJson), () -> {
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
                    textOr(inputJson, "paymentMethod", "bank_transfer"), text(inputJson, "paymentDate"), "",
                    textOrEmpty(inputJson, "referenceNo"), "done", textOrEmpty(inputJson, "remark"), 1,
                    timestamp, timestamp, context.actorId());
            Invoice invoice = new Invoice(invoiceId, context.tenantId(), docNo("INV"), "SALES", id, null,
                    current.customerId(), current.customerName(), current.currency(), current.totalAmount(),
                    "0", "0", "", text(inputJson, "paymentDate"), "done", "结算自动开票", 1,
                    timestamp, timestamp, context.actorId());
            Voucher voucher = new Voucher(voucherId, context.tenantId(), docNo("VOU"), "receipt",
                    "应收结算 " + current.docNo(), amount, amount, "posted", text(inputJson, "paymentDate"),
                    lines("INBOUND", amount), "Receivable", id, textOrEmpty(inputJson, "remark"), 1,
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
            @PathVariable String id, @RequestBody @jakarta.validation.Valid com.wanshen.platform.finance.dto.SettlementRequest input, HttpServletRequest request
    ) {
        var inputJson = objectMapper.valueToTree(input);
        RequestContext context = context(request);
        require(context, "finance.payment.create");
        require(context, "finance.payment.confirm");
        require(context, "finance.invoice.create");
        require(context, "finance.voucher.create");
        require(context, "finance.voucher.post");
        validateSettlement(inputJson);
        return command(context, "finance.payable.settle", input(id, inputJson), () -> {
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
                    textOr(inputJson, "paymentMethod", "bank_transfer"), text(inputJson, "paymentDate"), "",
                    textOrEmpty(inputJson, "referenceNo"), "done", textOrEmpty(inputJson, "remark"), 1,
                    timestamp, timestamp, context.actorId());
            Invoice invoice = new Invoice(invoiceId, context.tenantId(), docNo("INV"), "PURCHASE", null,
                    id, current.supplierId(), current.supplierName(), current.currency(), current.totalAmount(),
                    "0", "0", "", text(inputJson, "paymentDate"), "done", "结算自动开票", 1,
                    timestamp, timestamp, context.actorId());
            Voucher voucher = new Voucher(voucherId, context.tenantId(), docNo("VOU"), "payment",
                    "应付结算 " + current.docNo(), amount, amount, "posted", text(inputJson, "paymentDate"),
                    lines("OUTBOUND", amount), "Payable", id, textOrEmpty(inputJson, "remark"), 1,
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

    @PostMapping("/payments")
    public ResponseEntity<?> registerPayment(@RequestBody @jakarta.validation.Valid com.wanshen.platform.finance.dto.CreatePaymentRequest input, HttpServletRequest request) {
        var inputJson = objectMapper.valueToTree(input);
        RequestContext context = requireContext(request, "finance.payment.create");
        validatePayment(inputJson);
        log.info("[财务管理] 登记收付款 | 方向: {} | 租户: {}", inputJson.path("direction").asText("?"), context.tenantId());
        return command(context, "finance.payment.register", inputJson, () -> {
            String direction = text(inputJson, "direction");
            Receivable receivable = null;
            Payable payable = null;
            if ("INBOUND".equals(direction) && inputJson.hasNonNull("receivableId")) {
                receivable = getReceivable(context.tenantId(), inputJson.get("receivableId").asText());
                if (Set.of("done", "void").contains(receivable.status())) {
                    throw conflict("应收单当前状态不允许收款", "刷新数据后重试");
                }
                if (compare(text(inputJson, "amount"), receivable.outstandingAmount()) > 0) {
                    throw bad("收款金额超过未收余额", "减少收款金额");
                }
            }
            if ("OUTBOUND".equals(direction) && inputJson.hasNonNull("payableId")) {
                payable = getPayable(context.tenantId(), inputJson.get("payableId").asText());
                if (Set.of("done", "void").contains(payable.status())) {
                    throw conflict("应付单当前状态不允许付款", "刷新数据后重试");
                }
                if (compare(text(inputJson, "amount"), payable.outstandingAmount()) > 0) {
                    throw bad("付款金额超过未付余额", "减少付款金额");
                }
            }
            String timestamp = now();
            Payment payment = new Payment(UUID.randomUUID().toString(), context.tenantId(), docNo("PAY"),
                    direction, textOrNull(inputJson, "receivableId"), textOrNull(inputJson, "payableId"),
                    text(inputJson, "counterpartyId"), text(inputJson, "counterpartyName"),
                    textOr(inputJson, "currency", "CNY"), text(inputJson, "amount"),
                    text(inputJson, "paymentMethod"), text(inputJson, "paymentDate"),
                    textOrEmpty(inputJson, "bankAccount"), textOrEmpty(inputJson, "referenceNo"), "pending",
                    textOrEmpty(inputJson, "remark"), 1, timestamp, timestamp, context.actorId());
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
