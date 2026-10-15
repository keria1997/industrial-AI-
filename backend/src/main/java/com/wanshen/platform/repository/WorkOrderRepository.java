package com.wanshen.platform.repository;

import com.wanshen.platform.entity.WorkOrder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkOrderRepository extends JpaRepository<WorkOrder, UUID> {

    Optional<WorkOrder> findByTenantIdAndOrderNo(String tenantId, String orderNo);

    List<WorkOrder> findByTenantIdAndStatus(String tenantId, String status);

    List<WorkOrder> findByTenantIdOrderByUpdatedAtDesc(String tenantId);
}
