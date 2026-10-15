package com.wanshen.platform.controller;

import com.wanshen.platform.common.dto.ApiResponse;
import com.wanshen.platform.common.enums.SalesOrderStatus;
import com.wanshen.platform.entity.SalesOrder;
import com.wanshen.platform.fulfillment.dto.CancelOrderRequest;
import com.wanshen.platform.fulfillment.dto.ConfirmOrderRequest;
import com.wanshen.platform.fulfillment.dto.CreateSalesOrderRequest;
import com.wanshen.platform.service.SalesOrderService;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * 销售订单 REST Controller（JPA 版本）
 *
 * <p>使用 {@link SalesOrderService} 替代旧版 FulfillmentController。
 * <p>调用链路: 前端 → SalesOrderController → SalesOrderService → SalesOrderRepository → PostgreSQL
 *
 * <p>路径前缀 {@code /api/v2/sales/orders} 与旧版 {@code /api/v1/sales/sales-orders} 并存，
 * 前端逐步迁移到 v2 后，旧版可下线。
 */
@RestController
@RequestMapping("/api/v2/sales/orders")
@RequiredArgsConstructor
public class SalesOrderController {

    private final SalesOrderService orderService;
    private final RequestContextService requestContexts;

    /**
     * 创建销售订单
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<SalesOrder> create(
            @RequestBody @Valid CreateSalesOrderRequest request,
            HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        SalesOrder order = orderService.createOrder(ctx.tenantId(), ctx.actorId(), request);
        return ApiResponse.success(order);
    }

    /**
     * 按 ID 查询订单
     */
    @GetMapping("/{id}")
    public ApiResponse<SalesOrder> getById(
            @PathVariable String id,
            HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        SalesOrder order = orderService.findById(ctx.tenantId(), UUID.fromString(id));
        return ApiResponse.success(order);
    }

    /**
     * 查询订单列表
     */
    @GetMapping
    public ApiResponse<List<SalesOrder>> list(HttpServletRequest httpRequest) {
        RequestContext ctx = requestContexts.from(httpRequest);
        List<SalesOrder> orders = orderService.findAll(ctx.tenantId());
        return ApiResponse.success(orders);
    }

    /**
     * 确认订单
     */
    @PostMapping("/{id}/confirm")
    public ApiResponse<SalesOrder> confirm(
            @PathVariable String id,
            @RequestBody @Valid ConfirmOrderRequest request,
            HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        SalesOrder order = orderService.confirmOrder(ctx.tenantId(), UUID.fromString(id), request);
        return ApiResponse.success(order);
    }

    /**
     * 取消订单
     */
    @PostMapping("/{id}/cancel")
    public ApiResponse<SalesOrder> cancel(
            @PathVariable String id,
            @RequestBody @Valid CancelOrderRequest request,
            HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        SalesOrder order = orderService.cancelOrder(ctx.tenantId(), UUID.fromString(id), request);
        return ApiResponse.success(order);
    }

    /**
     * 查询异常停滞订单
     */
    @GetMapping("/stalled")
    public ApiResponse<List<SalesOrder>> stalled(
            @RequestParam(defaultValue = "3") int thresholdDays,
            HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        List<SalesOrder> orders = orderService.findStalledOrders(ctx.tenantId(), thresholdDays);
        return ApiResponse.success(orders);
    }

    /**
     * 查询交付高危订单
     */
    @GetMapping("/delivery-risk")
    public ApiResponse<List<SalesOrder>> deliveryRisk(HttpServletRequest httpRequest) {
        RequestContext ctx = requestContexts.from(httpRequest);
        List<SalesOrder> orders = orderService.findDeliveryRiskOrders(ctx.tenantId());
        return ApiResponse.success(orders);
    }
}
