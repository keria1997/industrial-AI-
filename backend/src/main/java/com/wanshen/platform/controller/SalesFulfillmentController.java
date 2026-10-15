package com.wanshen.platform.controller;

import com.wanshen.platform.common.dto.ApiResponse;
import com.wanshen.platform.entity.CustomerReceipt;
import com.wanshen.platform.entity.SalesQuote;
import com.wanshen.platform.entity.SalesRma;
import com.wanshen.platform.repository.CustomerReceiptRepository;
import com.wanshen.platform.repository.SalesQuoteRepository;
import com.wanshen.platform.repository.SalesRmaRepository;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 销售履约 Controller
 *
 * <p>覆盖前端 RmaManagementPanel / CustomerReceiptPanel / Sales_QuotesView / Sales_CustomersView 所需接口。
 * <p>路径: /api/v1/fulfillment/*
 */
@RestController
@RequestMapping("/api/v1/fulfillment")
@RequiredArgsConstructor
public class SalesFulfillmentController {

    private final SalesRmaRepository rmaRepository;
    private final CustomerReceiptRepository receiptRepository;
    private final SalesQuoteRepository quoteRepository;
    private final RequestContextService requestContexts;

    // ===== B-01: 查询 RMA 退货列表 =====
    @GetMapping("/rmas")
    public ApiResponse<List<SalesRma>> listRmas(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            HttpServletRequest request
    ) {
        RequestContext ctx = requestContexts.from(request);
        List<SalesRma> rmas = rmaRepository.findByTenantIdOrderByCreatedAtDesc(ctx.tenantId());
        return ApiResponse.success(rmas);
    }

    // ===== B-02: 创建 RMA 退货申请 =====
    @PostMapping("/rmas")
    public ApiResponse<SalesRma> createRma(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        RequestContext ctx = requestContexts.from(request);
        SalesRma rma = new SalesRma();
        rma.setTenantId(ctx.tenantId());
        rma.setRmaNo("RMA-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        rma.setOrderId(UUID.fromString((String) body.get("orderId")));
        rma.setOrderNo((String) body.getOrDefault("orderNo", ""));
        rma.setProductId((String) body.getOrDefault("productId", ""));
        rma.setProductName((String) body.getOrDefault("productName", ""));
        rma.setReason((String) body.getOrDefault("reason", ""));
        rma.setStatus("REQUESTED");
        SalesRma saved = rmaRepository.save(rma);
        return ApiResponse.success(saved);
    }

    // ===== B-03: 审批 RMA =====
    @PatchMapping("/rmas/{id}/approve")
    public ApiResponse<SalesRma> approveRma(
            @PathVariable String id,
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        SalesRma rma = rmaRepository.findById(UUID.fromString(id))
                .orElseThrow(() -> new RuntimeException("RMA not found: " + id));
        rma.setStatus("APPROVED");
        rma.setApprovedQty(java.math.BigDecimal.valueOf(
                ((Number) body.getOrDefault("approvedQty", rma.getRequestedQty())).doubleValue()));
        return ApiResponse.success(rmaRepository.save(rma));
    }

    // ===== B-04: RMA 检验 =====
    @PatchMapping("/rmas/{id}/inspect")
    public ApiResponse<SalesRma> inspectRma(
            @PathVariable String id,
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        SalesRma rma = rmaRepository.findById(UUID.fromString(id))
                .orElseThrow(() -> new RuntimeException("RMA not found: " + id));
        rma.setStatus("INSPECTION_COMPLETED");
        rma.setReceivedQty(java.math.BigDecimal.valueOf(
                ((Number) body.getOrDefault("receivedQty", 0)).doubleValue()));
        rma.setQualifiedQty(java.math.BigDecimal.valueOf(
                ((Number) body.getOrDefault("qualifiedQty", 0)).doubleValue()));
        rma.setScrapQty(java.math.BigDecimal.valueOf(
                ((Number) body.getOrDefault("scrapQty", 0)).doubleValue()));
        return ApiResponse.success(rmaRepository.save(rma));
    }

    // ===== B-05: 关闭 RMA（生成红字 AR） =====
    @PatchMapping("/rmas/{id}/close")
    public ApiResponse<SalesRma> closeRma(
            @PathVariable String id,
            HttpServletRequest request
    ) {
        SalesRma rma = rmaRepository.findById(UUID.fromString(id))
                .orElseThrow(() -> new RuntimeException("RMA not found: " + id));
        rma.setStatus("CLOSED");
        return ApiResponse.success(rmaRepository.save(rma));
    }

    // ===== B-06: 查询客户签收列表 =====
    @GetMapping("/customer-receipts")
    public ApiResponse<List<CustomerReceipt>> listReceipts(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            HttpServletRequest request
    ) {
        RequestContext ctx = requestContexts.from(request);
        List<CustomerReceipt> receipts = receiptRepository.findAll().stream()
                .filter(r -> r.getTenantId().equals(ctx.tenantId()))
                .toList();
        return ApiResponse.success(receipts);
    }

    // ===== B-07: 登记客户签收 =====
    @PostMapping("/customer-receipts")
    public ApiResponse<CustomerReceipt> createReceipt(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        RequestContext ctx = requestContexts.from(request);
        CustomerReceipt receipt = new CustomerReceipt();
        receipt.setTenantId(ctx.tenantId());
        receipt.setOrderId(UUID.fromString((String) body.get("orderId")));
        receipt.setReceiptNo("CR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        receipt.setStatus("PENDING");
        receipt.setSignedBy((String) body.getOrDefault("signedBy", ""));
        receipt.setRemark((String) body.getOrDefault("remark", ""));
        CustomerReceipt saved = receiptRepository.save(receipt);
        return ApiResponse.success(saved);
    }

    // ===== B-08: 查询报价列表 =====
    @GetMapping("/quotes")
    public ApiResponse<List<SalesQuote>> listQuotes(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            HttpServletRequest request
    ) {
        RequestContext ctx = requestContexts.from(request);
        List<SalesQuote> quotes = quoteRepository.findByTenantIdOrderByUpdatedAtDesc(ctx.tenantId());
        return ApiResponse.success(quotes);
    }

    // ===== B-09: 创建报价单 =====
    @PostMapping("/quotes")
    public ApiResponse<SalesQuote> createQuote(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        RequestContext ctx = requestContexts.from(request);
        SalesQuote quote = new SalesQuote();
        quote.setTenantId(ctx.tenantId());
        quote.setQuoteNo("QT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        quote.setCustomerId((String) body.getOrDefault("customerId", ""));
        quote.setCustomerName((String) body.getOrDefault("customerName", ""));
        quote.setQuoteDate(java.time.LocalDate.now());
        quote.setValidUntil(java.time.LocalDate.now().plusDays(30));
        quote.setTotalAmount(java.math.BigDecimal.ZERO);
        quote.setStatus("DRAFT");
        quote.setProductId((String) body.getOrDefault("productId", ""));
        quote.setProductName((String) body.getOrDefault("productName", ""));
        quote.setRemark((String) body.getOrDefault("remark", ""));
        SalesQuote saved = quoteRepository.save(quote);
        return ApiResponse.success(saved);
    }

    // ===== B-10: 查询客户列表（销售域） =====
    @GetMapping("/customers")
    public ApiResponse<List<Map<String, Object>>> listCustomers(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            HttpServletRequest request
    ) {
        // 销售域客户数据来自 sc_customer 表
        // TODO: 注入 sc_customer 查询，当前返回空列表
        return ApiResponse.success(List.of());
    }
}
