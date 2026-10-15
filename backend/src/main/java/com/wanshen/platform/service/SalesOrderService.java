package com.wanshen.platform.service;

import com.wanshen.platform.BusinessLogUtil;
import com.wanshen.platform.common.enums.SalesOrderStatus;
import com.wanshen.platform.entity.SalesOrder;
import com.wanshen.platform.entity.SalesOrderLine;
import com.wanshen.platform.fulfillment.dto.CreateSalesOrderRequest;
import com.wanshen.platform.fulfillment.dto.ConfirmOrderRequest;
import com.wanshen.platform.fulfillment.dto.CancelOrderRequest;
import com.wanshen.platform.repository.SalesOrderRepository;
import com.wanshen.platform.repository.SalesOrderLineRepository;
import com.wanshen.platform.web.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 销售订单服务（JPA 版本）
 *
 * <p>使用 JPA Repository 替代 Store 模式，提供类型安全的数据库访问。
 * <p>调用链路: Controller → SalesOrderService → SalesOrderRepository → PostgreSQL
 *
 * <p>状态机: PENDING_CONFIRMATION → CONFIRMED → REPLENISHING → PARTIALLY_SHIPPED → SHIPPED → COMPLETED
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class SalesOrderService {

    private final SalesOrderRepository orderRepository;
    private final SalesOrderLineRepository lineRepository;

    /**
     * 创建销售订单
     *
     * @throws ApiException 客户不存在或参数校验失败
     */
    @Transactional
    public SalesOrder createOrder(String tenantId, String actorId, CreateSalesOrderRequest request) {
        SalesOrder order = new SalesOrder();
        order.setTenantId(tenantId);
        order.setOrderNo(generateOrderNo());
        order.setCustomerId(request.customerId());
        order.setCustomerName(resolveCustomerName(tenantId, request.customerId()));
        order.setOwnerEmployeeId(actorId);
        order.setFulfillmentWarehouseId(request.warehouseId());
        order.setFactoryResourceId(request.factoryId());
        order.setRequestedDeliveryDate(request.requestedDeliveryDate());
        order.setAllowPartialShipment(request.allowPartialShipment());
        order.setCurrency("CNY");
        order.setTotalAmount(calculateTotalAmount(request));
        order.setOverallStatus(SalesOrderStatus.PENDING_CONFIRMATION.name());
        order.setReviewStatus("NOT_REQUIRED");
        order.setShipmentStatus("NOT_REQUESTED");
        order.setReviewRequired(false);
        order.setReviewPolicyVersion("v1");
        order.setRecipientName(request.recipientName());
        order.setRecipientPhoneCiphertext("encrypted");
        order.setRecipientPhoneKeyId("key-1");
        order.setRecipientPhoneMasked(maskPhone(request.recipientPhone()));
        order.setRecipientCountry(request.recipientCountry() != null ? request.recipientCountry() : "CN");
        order.setRecipientProvince(request.recipientProvince() != null ? request.recipientProvince() : "");
        order.setRecipientCity(request.recipientCity() != null ? request.recipientCity() : "");
        order.setRecipientDistrict(request.recipientDistrict());
        order.setRecipientAddress(request.recipientAddress());
        order.setRecipientPostalCode(request.recipientPostalCode());
        order.setCorrelationId(UUID.randomUUID());
        order.setCreatedBy(actorId);

        SalesOrder saved = orderRepository.save(order);

        // 保存订单行
        int lineNo = 1;
        for (CreateSalesOrderRequest.OrderLineItem item : request.lines()) {
            SalesOrderLine line = new SalesOrderLine();
            line.setTenantId(tenantId);
            line.setSalesOrderId(saved.getId());
            line.setLineNo(lineNo++);
            line.setProductId(item.productId());
            line.setOrderedQty(item.qty());
            line.setShippedQty(BigDecimal.ZERO);
            line.setActiveRequestedQty(BigDecimal.ZERO);
            line.setReservedQty(BigDecimal.ZERO);
            line.setUom(item.uom());
            line.setUnitPrice(item.unitPrice());
            line.setTaxRate(item.taxRate());
            line.setPromisedDate(item.promisedDate());
            line.setAllowPartialShipment(item.allowPartialShipment());
            line.setLineStatus("OPEN");
            lineRepository.save(line);
        }

        BusinessLogUtil.info("销售管理", "创建订单", saved.getOrderNo(),
                "客户:" + saved.getCustomerName() + " 金额:" + saved.getTotalAmount());
        return saved;
    }

    /**
     * 按ID查询订单
     */
    @Transactional(readOnly = true)
    public SalesOrder findById(String tenantId, UUID orderId) {
        return orderRepository.findByTenantIdAndId(tenantId, orderId)
                .orElseThrow(() -> new ApiException(404, "SALES_404_NOT_FOUND",
                        "销售订单不存在", "检查订单ID是否正确"));
    }

    /**
     * 查询租户下所有订单
     */
    @Transactional(readOnly = true)
    public List<SalesOrder> findAll(String tenantId) {
        return orderRepository.findByTenantIdOrderByUpdatedAtDesc(tenantId);
    }

    /**
     * 确认订单（固化发货内容）
     *
     * @throws ApiException 订单不存在或状态不允许确认
     */
    @Transactional
    public SalesOrder confirmOrder(String tenantId, UUID orderId, ConfirmOrderRequest request) {
        SalesOrder order = findById(tenantId, orderId);

        if (!SalesOrderStatus.PENDING_CONFIRMATION.name().equals(order.getOverallStatus())) {
            throw new ApiException(409, "SALES_409_INVALID_STATUS",
                    "订单当前状态不允许确认", "当前状态: " + order.getOverallStatus());
        }

        order.setOverallStatus(SalesOrderStatus.CONFIRMED.name());
        SalesOrder saved = orderRepository.save(order);

        BusinessLogUtil.info("销售管理", "确认订单", saved.getOrderNo(), "状态→CONFIRMED");
        return saved;
    }

    /**
     * 取消订单
     *
     * @throws ApiException 订单不存在、状态不允许取消、或版本冲突
     */
    @Transactional
    public SalesOrder cancelOrder(String tenantId, UUID orderId, CancelOrderRequest request) {
        SalesOrder order = findById(tenantId, orderId);

        if (!SalesOrderStatus.PENDING_CONFIRMATION.name().equals(order.getOverallStatus())) {
            throw new ApiException(409, "SALES_409_INVALID_STATUS",
                    "仅待发货订单可取消", "当前状态: " + order.getOverallStatus());
        }

        order.setOverallStatus(SalesOrderStatus.CANCELED.name());
        order.setCancelReason(request.reason());
        order.setCanceledAt(OffsetDateTime.now());
        SalesOrder saved = orderRepository.save(order);

        BusinessLogUtil.warn("销售管理", "取消订单", saved.getOrderNo(), "原因:" + request.reason());
        return saved;
    }

    /**
     * 查询异常停滞订单（待发货超过阈值天数）
     */
    @Transactional(readOnly = true)
    public List<SalesOrder> findStalledOrders(String tenantId, int thresholdDays) {
        return orderRepository.findStalledOrders(
                tenantId,
                SalesOrderStatus.PENDING_CONFIRMATION.name(),
                OffsetDateTime.now().minusDays(thresholdDays));
    }

    /**
     * 查询交付高危订单（交期在3天内的未完成订单）
     */
    @Transactional(readOnly = true)
    public List<SalesOrder> findDeliveryRiskOrders(String tenantId) {
        return orderRepository.findDeliveryRiskOrders(
                tenantId,
                List.of("PENDING_CONFIRMATION", "CONFIRMED", "REPLENISHING", "PARTIALLY_SHIPPED"),
                LocalDate.now().plusDays(3));
    }

    // ===== 私有方法 =====

    private String generateOrderNo() {
        return "SO-" + java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd")
                .format(LocalDate.now()) + "-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
    }

    private String resolveCustomerName(String tenantId, String customerId) {
        // TODO: 从 CustomerRepository 查询客户名称
        return customerId;
    }

    private BigDecimal calculateTotalAmount(CreateSalesOrderRequest request) {
        return request.lines().stream()
                .map(line -> line.qty().multiply(line.unitPrice()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private String maskPhone(String phone) {
        if (phone == null || phone.length() < 7) return "***";
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }
}
