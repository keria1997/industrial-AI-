package com.wanshen.platform.message.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;
import java.util.UUID;

/** Database access for message templates. */
public interface MessageTemplateJpaRepository
        extends JpaRepository<MessageTemplateEntity, UUID>, JpaSpecificationExecutor<MessageTemplateEntity> {
    Optional<MessageTemplateEntity> findByTenantIdAndCode(String tenantId, String code);

    Optional<MessageTemplateEntity> findByTenantIdAndBusinessId(String tenantId, String businessId);
}
