package com.wanshen.platform.message.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;
import java.util.UUID;

/** Database access for notification facts. */
public interface MessageRecordJpaRepository
        extends JpaRepository<MessageRecordEntity, UUID>, JpaSpecificationExecutor<MessageRecordEntity> {
    Optional<MessageRecordEntity> findByTenantIdAndBusinessId(String tenantId, String businessId);
}
