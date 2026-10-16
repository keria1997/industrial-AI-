package com.wanshen.platform.controller;

import com.wanshen.platform.common.dto.ApiResponse;
import com.wanshen.platform.entity.ProductionDemand;
import com.wanshen.platform.entity.WorkOrder;
import com.wanshen.platform.fulfillment.dto.ConfirmOrderRequest;
import com.wanshen.platform.production.dto.CreateDemandRequest;
import com.wanshen.platform.production.dto.ReportWorkRequest;
import com.wanshen.platform.service.ProductionOrderService;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * 生产订单 REST Controller（JPA 版本）
 *
 * <p>路径 {@code /api/v2/production} 与旧版 {@code /api/v1/production} 并存。
 */
@RestController
@RequestMapping("/api/v2/production")
@RequiredArgsConstructor
public class ProductionOrderController {

    private final ProductionOrderService productionService;
    private final RequestContextService requestContexts;

    /**
     * 创建生产需求
     */
    @PostMapping("/demands")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ProductionDemand> createDemand(
            @RequestBody @Valid CreateDemandRequest request,
            HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        ProductionDemand demand = productionService.createDemand(ctx.tenantId(), request);
        return ApiResponse.success(demand);
    }

    /**
     * 审批生产需求
     */
    @PostMapping("/demands/{id}/approve")
    public ApiResponse<ProductionDemand> approveDemand(
            @PathVariable String id,
            HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        ProductionDemand demand = productionService.approveDemand(ctx.tenantId(), UUID.fromString(id));
        return ApiResponse.success(demand);
    }

    /**
     * 查询全部生产需求
     */
    @GetMapping("/demands")
    public ApiResponse<List<ProductionDemand>> listDemands(HttpServletRequest httpRequest) {
        RequestContext ctx = requestContexts.from(httpRequest);
        List<ProductionDemand> demands = productionService.findAllDemands(ctx.tenantId());
        return ApiResponse.success(demands);
    }

    /**
     * 校验生产需求
     */
    @PostMapping("/demands/{id}/validate")
    public ApiResponse<ProductionDemand> validateDemand(
            @PathVariable String id, HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        return ApiResponse.success(productionService.approveDemand(ctx.tenantId(), UUID.fromString(id)));
    }

    /**
     * 接收生产需求
     */
    @PostMapping("/demands/{id}/claim")
    public ApiResponse<ProductionDemand> claimDemand(
            @PathVariable String id, HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        return ApiResponse.success(productionService.approveDemand(ctx.tenantId(), UUID.fromString(id)));
    }

    /**
     * 创建工单
     */
    @PostMapping("/work-orders")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<WorkOrder> createWorkOrder(
            @RequestParam String demandId,
            @RequestParam String productId,
            @RequestParam BigDecimal qty,
            @RequestParam String factoryId,
            HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        WorkOrder wo = productionService.createWorkOrder(
                ctx.tenantId(), UUID.fromString(demandId), productId, qty, factoryId, productId);
        return ApiResponse.success(wo);
    }

    /**
     * 报工
     */
    @PostMapping("/work-orders/{id}/report")
    public ApiResponse<WorkOrder> reportWork(
            @PathVariable String id,
            @RequestBody @Valid ReportWorkRequest request,
            HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        WorkOrder wo = productionService.reportWork(ctx.tenantId(), UUID.fromString(id), request);
        return ApiResponse.success(wo);
    }

    /**
     * 完工入库
     */
    @PostMapping("/work-orders/{id}/complete")
    public ApiResponse<WorkOrder> complete(
            @PathVariable String id,
            HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        WorkOrder wo = productionService.completeWorkOrder(ctx.tenantId(), UUID.fromString(id));
        return ApiResponse.success(wo);
    }

    /**
     * 结案
     */
    @PostMapping("/work-orders/{id}/close")
    public ApiResponse<WorkOrder> close(
            @PathVariable String id,
            HttpServletRequest httpRequest
    ) {
        RequestContext ctx = requestContexts.from(httpRequest);
        WorkOrder wo = productionService.closeWorkOrder(ctx.tenantId(), UUID.fromString(id));
        return ApiResponse.success(wo);
    }

    /**
     * 查询全部工单
     */
    @GetMapping("/work-orders")
    public ApiResponse<List<WorkOrder>> listWorkOrders(HttpServletRequest httpRequest) {
        RequestContext ctx = requestContexts.from(httpRequest);
        List<WorkOrder> orders = productionService.findAllWorkOrders(ctx.tenantId());
        return ApiResponse.success(orders);
    }

    /**
     * 按 ID 查询工单
     */
    @GetMapping("/work-orders/{id}")
    public ApiResponse<WorkOrder> getWorkOrder(
            @PathVariable String id, HttpServletRequest httpRequest
    ) {
        return ApiResponse.success(
                productionService.findAllWorkOrders(
                        requestContexts.from(httpRequest).tenantId()
                ).stream()
                .filter(wo -> wo.getId().toString().equals(id))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("工单不存在: " + id)));
    }

    /**
     * 下达工单
     */
    @PostMapping("/work-orders/{id}/release")
    public ApiResponse<WorkOrder> release(
            @PathVariable String id, HttpServletRequest httpRequest
    ) {
        return ApiResponse.success(productionService.completeWorkOrder(
                requestContexts.from(httpRequest).tenantId(), UUID.fromString(id)));
    }
}
