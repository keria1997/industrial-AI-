package com.wanshen.platform.repository;

import com.wanshen.platform.entity.ProductionDemand;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProductionDemandRepository extends JpaRepository<ProductionDemand, UUID> {

    Optional<ProductionDemand> findByTenantIdAndDemandNo(String tenantId, String demandNo);

    List<ProductionDemand> findByTenantIdAndStatus(String tenantId, String status);

    List<ProductionDemand> findByTenantIdOrderByUpdatedAtDesc(String tenantId);

    Optional<ProductionDemand> findByIdempotencyKey(String idempotencyKey);
}
