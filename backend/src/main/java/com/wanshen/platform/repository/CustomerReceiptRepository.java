package com.wanshen.platform.repository;

import com.wanshen.platform.entity.CustomerReceipt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CustomerReceiptRepository extends JpaRepository<CustomerReceipt, UUID> {

    Optional<CustomerReceipt> findByTenantIdAndOrderId(String tenantId, UUID orderId);

    Optional<CustomerReceipt> findByTenantIdAndReceiptNo(String tenantId, String receiptNo);

    List<CustomerReceipt> findByTenantIdAndStatus(String tenantId, String status);
}
