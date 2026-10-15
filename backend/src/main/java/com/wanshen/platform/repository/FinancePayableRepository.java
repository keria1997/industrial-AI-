package com.wanshen.platform.repository;

import com.wanshen.platform.entity.FinancePayable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FinancePayableRepository extends JpaRepository<FinancePayable, UUID> {

    Optional<FinancePayable> findByTenantIdAndDocNo(String tenantId, String docNo);

    List<FinancePayable> findByTenantIdAndStatus(String tenantId, String status);

    List<FinancePayable> findByTenantIdOrderByUpdatedAtDesc(String tenantId);

    @Query("SELECT COALESCE(SUM(p.outstandingAmount), 0) FROM FinancePayable p " +
           "WHERE p.tenantId = :tenantId AND p.status NOT IN ('done','void')")
    BigDecimal sumOutstandingByTenantId(@Param("tenantId") String tenantId);
}
