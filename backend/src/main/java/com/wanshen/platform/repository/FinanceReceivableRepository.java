package com.wanshen.platform.repository;

import com.wanshen.platform.entity.FinanceReceivable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FinanceReceivableRepository extends JpaRepository<FinanceReceivable, UUID> {

    List<FinanceReceivable> findByTenantIdAndStatus(String tenantId, String status);

    List<FinanceReceivable> findByTenantIdOrderByUpdatedAtDesc(String tenantId);

    @Query("SELECT COALESCE(SUM(r.outstandingAmount), 0) FROM FinanceReceivable r " +
           "WHERE r.tenantId = :tenantId AND r.status NOT IN ('SETTLED','REVERSED')")
    BigDecimal sumOutstandingByTenantId(@Param("tenantId") String tenantId);
}
