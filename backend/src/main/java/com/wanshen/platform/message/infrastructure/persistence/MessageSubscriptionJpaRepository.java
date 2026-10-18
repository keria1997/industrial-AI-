package com.wanshen.platform.message.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Database access for business-event subscriptions. */
public interface MessageSubscriptionJpaRepository extends JpaRepository<MessageSubscriptionEntity, UUID> {
    List<MessageSubscriptionEntity> findByTenantIdAndUserIdOrderByCreatedAtDesc(String tenantId, String userId);

    Optional<MessageSubscriptionEntity> findByTenantIdAndUserIdAndEventType(
            String tenantId, String userId, String eventType
    );

    Optional<MessageSubscriptionEntity> findByTenantIdAndBusinessId(String tenantId, String businessId);
}
