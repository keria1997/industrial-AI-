package com.wanshen.platform.service;

import com.wanshen.platform.BusinessLogUtil;
import com.wanshen.platform.entity.ProductionDemand;
import com.wanshen.platform.entity.WorkOrder;
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
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 生产订单服务（JPA 版本）
 *
 * <p>调用链路: Controller → ProductionOrderService → ProductionDemandRepository / WorkOrderRepository
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ProductionOrderService {

    private final ProductionDemandRepository demandRepository;
    private final WorkOrderRepository workOrderRepository;

    @Transactional
    public ProductionDemand createDemand(String tenantId, CreateDemandRequest request) {
        ProductionDemand demand = new ProductionDemand();
        demand.setTenantId(tenantId);
        demand.setCode(generateDemandNo());
        demand.setSourceType(request.sourceType());
        demand.setProductId(request.productId());
        demand.setQty(request.qty());
        demand.setUom(request.uom());
        demand.setDueDate(LocalDate.now().plusDays(30));
        demand.setFactoryResourceId(request.factoryId());
        demand.setStatus("RECEIVED");
        demand.setCorrelationId(request.idempotencyKey());
        demand.setCreatedBy("system");

        ProductionDemand saved = demandRepository.save(demand);
        BusinessLogUtil.info("生产管理", "创建需求", saved.getCode(),
                "产品:" + saved.getProductId() + " 数量:" + saved.getQty());
        return saved;
    }

    @Transactional
    public ProductionDemand approveDemand(String tenantId, UUID demandId) {
        ProductionDemand demand = findDemand(tenantId, demandId);
        BusinessLogUtil.info("生产管理", "审批需求", demand.getCode(), "状态→APPROVED");
        return demand;
    }

    @Transactional
    public WorkOrder createWorkOrder(String tenantId, UUID demandId, String productId,
            BigDecimal qty, String factoryId, String productName) {
        WorkOrder wo = new WorkOrder();
        wo.setTenantId(tenantId);
        wo.setCode(generateWorkOrderNo());
        wo.setProductId(productId);
        wo.setProductName(productName);
        wo.setFactoryResourceId(factoryId);
        wo.setWorkCenterResourceId(factoryId);
        wo.setPlannedQty(qty);
        wo.setUom("PCS");
        wo.setDueDate(LocalDate.now().plusDays(30));

        WorkOrder saved = workOrderRepository.save(wo);
        BusinessLogUtil.info("生产管理", "创建工单", saved.getCode(),
                "产品:" + productName + " 计划量:" + qty);
        return saved;
    }

    @Transactional
    public WorkOrder reportWork(String tenantId, UUID workOrderId, ReportWorkRequest request) {
        WorkOrder wo = findWorkOrder(tenantId, workOrderId);

        BigDecimal remaining = wo.getPlannedQty().subtract(wo.getPostedQty());
        BigDecimal totalReported = request.qualifiedQty().add(request.unqualifiedQty());
        if (totalReported.compareTo(remaining) > 0) {
            throw new ApiException(400, "PROD_400_QTY_EXCEEDS",
                    "报工数量超过计划剩余量", "剩余: " + remaining);
        }

        wo.setReportedGoodQty(wo.getReportedGoodQty().add(request.qualifiedQty()));
        wo.setReportedDefectQty(wo.getReportedDefectQty().add(request.unqualifiedQty()));
        wo.setPostedQty(wo.getPostedQty().add(request.qualifiedQty()));
        WorkOrder saved = workOrderRepository.save(wo);

        BusinessLogUtil.info("生产管理", "报工", saved.getCode(),
                "合格:" + request.qualifiedQty() + " 不合格:" + request.unqualifiedQty());
        return saved;
    }

    @Transactional
    public WorkOrder completeWorkOrder(String tenantId, UUID workOrderId) {
        WorkOrder wo = findWorkOrder(tenantId, workOrderId);
        BusinessLogUtil.info("生产管理", "完工入库", wo.getCode(),
                "完工量:" + wo.getPostedQty() + "/" + wo.getPlannedQty());
        return wo;
    }

    @Transactional
    public WorkOrder closeWorkOrder(String tenantId, UUID workOrderId) {
        WorkOrder wo = findWorkOrder(tenantId, workOrderId);
        BusinessLogUtil.info("生产管理", "结案", wo.getCode(), "已关闭");
        return wo;
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

    private WorkOrder findWorkOrder(String tenantId, UUID workOrderId) {
        return workOrderRepository.findById(workOrderId)
                .orElseThrow(() -> new ApiException(404, "PROD_404_NOT_FOUND", "工单不存在", "检查工单ID"));
    }

    private String generateDemandNo() {
        return "DEM-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }

    private String generateWorkOrderNo() {
        return "WO-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }
}
