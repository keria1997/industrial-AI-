package com.wanshen.platform.message.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/** Append-only database access for message audit facts. */
public interface MessageAuditLogJpaRepository extends JpaRepository<MessageAuditLogEntity, UUID> {
}
