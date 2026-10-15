package com.wanshen.platform.service;

import com.wanshen.platform.BusinessLogUtil;
import com.wanshen.platform.entity.ProductionDemand;
import com.wanshen.platform.entity.WorkOrder;
import com.wanshen.platform.fulfillment.dto.ConfirmOrderRequest;
import com.wanshen.platform.production.dto.CreateDemandRequest;
import com.wanshen.platform.production.dto.ReportWorkRequest;
import com.wanshen.platform.repository.ProductionDemandRepository;
import com.wanshen.platform.repository.WorkOrderRepository;
import com.wanshen.platform.web.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * 生产订单服务（JPA 版本）
 *
 * <p>调用链路: Controller → ProductionOrderService → ProductionDemandRepository / WorkOrderRepository
 *
 * <p>需求状态机: PENDING_REVIEW → APPROVED → CLAIMED → PLANNED → SCHEDULED → COMPLETED
 * <p>工单状态机: CREATED → RELEASED → IN_PROGRESS → PENDING_COMPLETION → COMPLETION_POSTED → CLOSED
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ProductionOrderService {

    private final ProductionDemandRepository demandRepository;
    private final WorkOrderRepository workOrderRepository;

    /**
     * 创建生产需求
     */
    @Transactional
    public ProductionDemand createDemand(String tenantId, CreateDemandRequest request) {
        // 幂等检查
        demandRepository.findByIdempotencyKey(request.idempotencyKey()).ifPresent(existing -> {
            throw new ApiException(409, "PROD_409_DUPLICATE", "重复请求已忽略", "相同幂等键的需求已存在");
        });

        ProductionDemand demand = new ProductionDemand();
        demand.setTenantId(tenantId);
        demand.setDemandNo(generateDemandNo());
        demand.setSourceType(request.sourceType());
        demand.setSourceId(UUID.fromString(request.sourceId()));
        demand.setSourceLineId(request.sourceLineId() != null ? UUID.fromString(request.sourceLineId()) : null);
        demand.setProductId(request.productId());
        demand.setQty(request.qty());
        demand.setFactoryResourceId(request.factoryId());
        demand.setWarehouseId(request.warehouseId());
        demand.setUom(request.uom());
        demand.setStatus("PENDING_REVIEW");
        demand.setIdempotencyKey(request.idempotencyKey());

        ProductionDemand saved = demandRepository.save(demand);

        BusinessLogUtil.info("生产管理", "创建需求", saved.getDemandNo(),
                "产品:" + saved.getProductId() + " 数量:" + saved.getQty());
        return saved;
    }

    /**
     * 审批生产需求
     */
    @Transactional
    public ProductionDemand approveDemand(String tenantId, UUID demandId) {
        ProductionDemand demand = findDemand(tenantId, demandId);

        if (!"PENDING_REVIEW".equals(demand.getStatus())) {
            throw new ApiException(409, "PROD_409_INVALID_STATUS",
                    "需求当前状态不允许审批", "状态: " + demand.getStatus());
        }

        demand.setStatus("APPROVED");
        ProductionDemand saved = demandRepository.save(demand);

        BusinessLogUtil.info("生产管理", "审批需求", saved.getDemandNo(), "状态→APPROVED");
        return saved;
    }

    /**
     * 创建工单
     */
    @Transactional
    public WorkOrder createWorkOrder(String tenantId, UUID demandId, String productId, BigDecimal qty, String factoryId) {
        ProductionDemand demand = findDemand(tenantId, demandId);

        if (!List.of("APPROVED", "CLAIMED", "PLANNED").contains(demand.getStatus())) {
            throw new ApiException(409, "PROD_409_INVALID_STATUS",
                    "需求当前状态不允许创建工单", "状态: " + demand.getStatus());
        }

        WorkOrder wo = new WorkOrder();
        wo.setTenantId(tenantId);
        wo.setOrderNo(generateWorkOrderNo());
        wo.setDemandId(demandId);
        wo.setProductId(productId);
        wo.setPlannedQty(qty);
        wo.setCompletedQty(BigDecimal.ZERO);
        wo.setFactoryResourceId(factoryId);
        wo.setStatus("CREATED");

        WorkOrder saved = workOrderRepository.save(wo);

        demand.setStatus("SCHEDULED");
        demandRepository.save(demand);

        BusinessLogUtil.info("生产管理", "创建工单", saved.getOrderNo(),
                "需求:" + demand.getDemandNo() + " 计划量:" + qty);
        return saved;
    }

    /**
     * 报工
     */
    @Transactional
    public WorkOrder reportWork(String tenantId, UUID workOrderId, ReportWorkRequest request) {
        WorkOrder wo = workOrderRepository.findById(workOrderId)
                .orElseThrow(() -> new ApiException(404, "PROD_404_NOT_FOUND", "工单不存在", "检查工单ID"));

        if (!"IN_PROGRESS".equals(wo.getStatus())) {
            throw new ApiException(409, "PROD_409_INVALID_STATUS",
                    "工单当前状态不允许报工", "状态: " + wo.getStatus());
        }

        BigDecimal totalReported = request.qualifiedQty().add(request.unqualifiedQty());
        BigDecimal remaining = wo.getPlannedQty().subtract(wo.getCompletedQty());
        if (totalReported.compareTo(remaining) > 0) {
            throw new ApiException(400, "PROD_400_QTY_EXCEEDS",
                    "报工数量超过计划剩余量", "剩余: " + remaining + " 本次报工: " + totalReported);
        }

        wo.setCompletedQty(wo.getCompletedQty().add(request.qualifiedQty()));
        WorkOrder saved = workOrderRepository.save(wo);

        BusinessLogUtil.info("生产管理", "报工", saved.getOrderNo(),
                "合格:" + request.qualifiedQty() + " 不合格:" + request.unqualifiedQty());
        return saved;
    }

    /**
     * 完工入库
     */
    @Transactional
    public WorkOrder completeWorkOrder(String tenantId, UUID workOrderId) {
        WorkOrder wo = workOrderRepository.findById(workOrderId)
                .orElseThrow(() -> new ApiException(404, "PROD_404_NOT_FOUND", "工单不存在", "检查工单ID"));

        if (!"IN_PROGRESS".equals(wo.getStatus())) {
            throw new ApiException(409, "PROD_409_INVALID_STATUS",
                    "工单当前状态不允许完工", "状态: " + wo.getStatus());
        }

        wo.setStatus("COMPLETION_POSTED");
        WorkOrder saved = workOrderRepository.save(wo);

        BusinessLogUtil.info("生产管理", "完工入库", saved.getOrderNo(),
                "完工量:" + saved.getCompletedQty() + "/" + saved.getPlannedQty());
        return saved;
    }

    /**
     * 结案
     */
    @Transactional
    public WorkOrder closeWorkOrder(String tenantId, UUID workOrderId, ConfirmOrderRequest request) {
        WorkOrder wo = workOrderRepository.findById(workOrderId)
                .orElseThrow(() -> new ApiException(404, "PROD_404_NOT_FOUND", "工单不存在", "检查工单ID"));

        if (!"COMPLETION_POSTED".equals(wo.getStatus())) {
            throw new ApiException(409, "PROD_409_INVALID_STATUS",
                    "工单当前状态不允许结案", "状态: " + wo.getStatus());
        }

        wo.setStatus("CLOSED");
        WorkOrder saved = workOrderRepository.save(wo);

        BusinessLogUtil.info("生产管理", "结案", saved.getOrderNo(), "已关闭");
        return saved;
    }

    @Transactional(readOnly = true)
    public List<ProductionDemand> findAllDemands(String tenantId) {
        return demandRepository.findByTenantIdOrderByUpdatedAtDesc(tenantId);
    }

    @Transactional(readOnly = true)
    public List<WorkOrder> findAllWorkOrders(String tenantId) {
        return workOrderRepository.findByTenantIdOrderByUpdatedAtDesc(tenantId);
    }

    private ProductionDemand findDemand(String tenantId, UUID demandId) {
        return demandRepository.findById(demandId)
                .orElseThrow(() -> new ApiException(404, "PROD_404_NOT_FOUND", "生产需求不存在", "检查需求ID"));
    }

    private String generateDemandNo() {
        return "DEM-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }

    private String generateWorkOrderNo() {
        return "WO-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }
}
