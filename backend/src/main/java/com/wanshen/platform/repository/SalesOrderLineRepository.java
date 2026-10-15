package com.wanshen.platform.repository;

import com.wanshen.platform.entity.SalesOrderLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SalesOrderLineRepository extends JpaRepository<SalesOrderLine, UUID> {

    List<SalesOrderLine> findByTenantIdAndSalesOrderIdOrderByLineNoAsc(String tenantId, UUID salesOrderId);
}
