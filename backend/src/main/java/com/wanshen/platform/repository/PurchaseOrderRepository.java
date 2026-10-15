package com.wanshen.platform.repository;

import com.wanshen.platform.entity.PurchaseOrder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, UUID> {

    Optional<PurchaseOrder> findByTenantIdAndOrderNo(String tenantId, String orderNo);

    List<PurchaseOrder> findByTenantIdAndStatus(String tenantId, String status);

    List<PurchaseOrder> findByTenantIdOrderByUpdatedAtDesc(String tenantId);
}
