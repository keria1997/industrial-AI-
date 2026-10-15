package com.wanshen.platform.controller;

import com.wanshen.platform.common.dto.ApiResponse;
import com.wanshen.platform.entity.Payment;
import com.wanshen.platform.finance.dto.CreatePaymentRequest;
import com.wanshen.platform.service.FinancePaymentService;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * 财务收付款 REST Controller（JPA 版本）
 *
 * <p>路径 {@code /api/v2/finance/payments} 与旧版 {@code /api/v1/finance/payments} 并存。
 */
@RestController
@RequestMapping("/api/v2/finance/payments")
@RequiredArgsConstructor
public class FinancePaymentController {

    private final FinancePaymentService paymentService;
    private final RequestContextService requestContexts;

    /**
     * 登记收付款
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<Payment> register(
            @RequestBody @Valid CreatePaymentRequest request,
            HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        Payment payment = paymentService.registerPayment(ctx.tenantId(), ctx.actorId(), request);
        return ApiResponse.success(payment);
    }

    /**
     * 确认收付款（推进 AR/AP 状态）
     */
    @PostMapping("/{id}/confirm")
    public ApiResponse<Payment> confirm(
            @PathVariable String id,
            HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        Payment payment = paymentService.confirmPayment(ctx.tenantId(), UUID.fromString(id));
        return ApiResponse.success(payment);
    }

    /**
     * 查询全部收付款记录
     */
    @GetMapping
    public ApiResponse<List<Payment>> list(HttpServletRequest httpRequest) {
        RequestContext ctx = requestContexts.from(httpRequest);
        List<Payment> payments = paymentService.findAll(ctx.tenantId());
        return ApiResponse.success(payments);
    }
}
