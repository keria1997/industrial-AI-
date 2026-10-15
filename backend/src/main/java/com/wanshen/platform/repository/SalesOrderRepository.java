package com.wanshen.platform.repository;

import com.wanshen.platform.entity.SalesOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 销售订单 JPA Repository
 *
 * <p>所有查询通过 {@code tenantId} 隔离，配合 PostgreSQL RLS 实现租户数据隔离。
 */
public interface SalesOrderRepository extends JpaRepository<SalesOrder, UUID> {

    Optional<SalesOrder> findByTenantIdAndId(String tenantId, UUID id);

    Optional<SalesOrder> findByTenantIdAndOrderNo(String tenantId, String orderNo);

    List<SalesOrder> findByTenantIdAndOverallStatus(String tenantId, String status);

    List<SalesOrder> findByTenantIdOrderByUpdatedAtDesc(String tenantId);

    @Query("SELECT o FROM SalesOrder o WHERE o.tenantId = :tenantId " +
           "AND o.overallStatus = :status " +
           "AND o.createdAt < :before " +
           "ORDER BY o.createdAt ASC")
    List<SalesOrder> findStalledOrders(
            @Param("tenantId") String tenantId,
            @Param("status") String status,
            @Param("before") java.time.OffsetDateTime before);

    @Query("SELECT o FROM SalesOrder o WHERE o.tenantId = :tenantId " +
           "AND o.overallStatus IN :statuses " +
           "AND o.requestedDeliveryDate <= :deliveryDate " +
           "ORDER BY o.requestedDeliveryDate ASC")
    List<SalesOrder> findDeliveryRiskOrders(
            @Param("tenantId") String tenantId,
            @Param("statuses") List<String> statuses,
            @Param("deliveryDate") LocalDate deliveryDate);

    @Query("SELECT COALESCE(SUM(o.totalAmount), 0) FROM SalesOrder o " +
           "WHERE o.tenantId = :tenantId AND o.overallStatus != 'CANCELED'")
    BigDecimal sumTotalAmountByTenantId(@Param("tenantId") String tenantId);

    long countByTenantIdAndOverallStatus(String tenantId, String status);
}
