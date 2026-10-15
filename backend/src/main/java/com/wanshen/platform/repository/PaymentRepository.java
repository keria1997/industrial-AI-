package com.wanshen.platform.repository;

import com.wanshen.platform.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    Optional<Payment> findByTenantIdAndDocNo(String tenantId, String docNo);

    List<Payment> findByTenantIdAndDirection(String tenantId, String direction);

    List<Payment> findByTenantIdAndReceivableId(String tenantId, UUID receivableId);

    List<Payment> findByTenantIdAndPayableId(String tenantId, UUID payableId);

    List<Payment> findByTenantIdOrderByCreatedAtDesc(String tenantId);
}
