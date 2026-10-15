package com.wanshen.platform.repository;

import com.wanshen.platform.entity.SalesRma;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SalesRmaRepository extends JpaRepository<SalesRma, UUID> {

    Optional<SalesRma> findByTenantIdAndRmaNo(String tenantId, String rmaNo);

    List<SalesRma> findByTenantIdOrderByCreatedAtDesc(String tenantId);

    List<SalesRma> findByTenantIdAndStatus(String tenantId, String status);
}
