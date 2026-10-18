package com.wanshen.platform.message.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/** Database access for replayable message commands. */
public interface MessageIdempotencyJpaRepository extends JpaRepository<MessageIdempotencyEntity, UUID> {
    Optional<MessageIdempotencyEntity> findByTenantIdAndCommandTypeAndIdempotencyKey(
            String tenantId, String commandType, String idempotencyKey
    );
}
