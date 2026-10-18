package com.wanshen.platform.message.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Database access for transactional message events. */
public interface MessageOutboxJpaRepository extends JpaRepository<MessageOutboxEntity, UUID> {
    List<MessageOutboxEntity> findByTenantIdAndStatusOrderByCreatedAtAsc(String tenantId, String status);

    Optional<MessageOutboxEntity> findByTenantIdAndEventId(String tenantId, String eventId);

    List<String> findDistinctTenantIdsByStatus(String status);
}
