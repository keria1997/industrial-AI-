package com.wanshen.platform.message.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Database access for user notification preferences. */
public interface MessagePreferenceJpaRepository extends JpaRepository<MessagePreferenceEntity, UUID> {
    List<MessagePreferenceEntity> findByTenantIdAndUserIdOrderByCreatedAtDesc(String tenantId, String userId);

    Optional<MessagePreferenceEntity> findByTenantIdAndUserIdAndCategoryAndChannel(
            String tenantId, String userId, String category, String channel
    );

    Optional<MessagePreferenceEntity> findByTenantIdAndBusinessId(String tenantId, String businessId);
}
