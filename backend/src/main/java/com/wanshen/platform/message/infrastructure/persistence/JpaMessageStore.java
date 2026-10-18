package com.wanshen.platform.message.infrastructure.persistence;

import com.wanshen.platform.message.AbstractMessageStore;
import com.wanshen.platform.storage.ModuleInfra.AuditLog;
import com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord;
import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;
import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * JPA adapter for the message module's physical tables.
 *
 * <p>The adapter intentionally keeps the old message store interface so the current
 * controller and worker can be switched without changing their HTTP behavior.</p>
 */
public class JpaMessageStore implements AbstractMessageStore {
    private static final String TENANT_VARIABLE = "app.current_tenant_id";
    private static final String BOOTSTRAP_VARIABLE = "app.bootstrap_mode";

    private final MessageTemplateJpaRepository templates;
    private final MessageRecordJpaRepository records;
    private final MessagePreferenceJpaRepository preferences;
    private final MessageSubscriptionJpaRepository subscriptions;
    private final MessageOutboxJpaRepository outbox;
    private final MessageAuditLogJpaRepository auditLogs;
    private final MessageIdempotencyJpaRepository idempotencyRecords;
    private final TransactionTemplate transactions;
    private final EntityManager entityManager;

    public JpaMessageStore(
            MessageTemplateJpaRepository templates,
            MessageRecordJpaRepository records,
            MessagePreferenceJpaRepository preferences,
            MessageSubscriptionJpaRepository subscriptions,
            MessageOutboxJpaRepository outbox,
            MessageAuditLogJpaRepository auditLogs,
            MessageIdempotencyJpaRepository idempotencyRecords,
            TransactionTemplate transactions,
            EntityManager entityManager
    ) {
        this.templates = templates;
        this.records = records;
        this.preferences = preferences;
        this.subscriptions = subscriptions;
        this.outbox = outbox;
        this.auditLogs = auditLogs;
        this.idempotencyRecords = idempotencyRecords;
        this.transactions = transactions;
        this.entityManager = entityManager;
    }

    @Override
    public <T> T transaction(Supplier<T> work) {
        return transactions.execute(status -> work.get());
    }

    @Override
    public AbstractMessageStore.Page<Template> templates(
            String tenantId, Integer pageNumber, Integer pageSize, String category,
            String channel, Boolean active, String search
    ) {
        return inTenant(tenantId, () -> {
            Specification<MessageTemplateEntity> specification = (root, query, builder) -> {
                List<Predicate> predicates = new ArrayList<>();
                predicates.add(builder.equal(root.get("tenantId"), tenantId));
                addEqual(predicates, builder, root.get("category"), category);
                addEqual(predicates, builder, root.get("channel"), channel);
                if (active != null) predicates.add(builder.equal(root.get("active"), active));
                addSearch(predicates, builder, List.of(root.get("code"), root.get("name")), search);
                return builder.and(predicates.toArray(Predicate[]::new));
            };
            var springPage = templates.findAll(specification, pageable(pageNumber, pageSize)).map(this::toDomain);
            return toStorePage(springPage);
        });
    }

    @Override
    public Optional<Template> template(String tenantId, String id) {
        return inTenant(tenantId, () -> parseUuid(id).flatMap(templates::findById).map(this::toDomain));
    }

    @Override
    public Optional<Template> templateByCode(String tenantId, String code) {
        return inTenant(tenantId, () -> templates.findByTenantIdAndCode(tenantId, code).map(this::toDomain));
    }

    @Override
    public void saveTemplate(Template value) {
        inTenant(value.tenantId(), () -> {
            MessageTemplateEntity entity = templates
                    .findByTenantIdAndBusinessId(value.tenantId(), value.id())
                    .or(() -> parseUuid(value.id()).flatMap(templates::findById))
                    .orElseGet(() -> new MessageTemplateEntity(
                            UUID.fromString(value.id()), value.id(), value.tenantId(), value.code(), value.name(),
                            value.category(), value.channel(), value.titleTemplate(), value.bodyTemplate(),
                            value.variables(), value.priority(), value.isActive(), value.remark(),
                            parseTime(value.createdAt()), parseTime(value.updatedAt()), value.createdBy()
                    ));
            entity.apply(
                    value.name(), value.category(), value.channel(), value.titleTemplate(),
                    value.bodyTemplate(), value.variables(), value.priority(), value.isActive(),
                    value.remark(), parseTime(value.updatedAt())
            );
            templates.save(entity);
            return null;
        });
    }

    @Override
    public void deleteTemplate(String tenantId, String id) {
        inTenant(tenantId, () -> {
            parseUuid(id).ifPresent(templates::deleteById);
            return null;
        });
    }

    @Override
    public AbstractMessageStore.Page<MessageRecord> records(
            String tenantId, Integer pageNumber, Integer pageSize, String recipientId,
            String category, Boolean read, Boolean archived, Boolean starred,
            String priority, String search
    ) {
        return inTenant(tenantId, () -> {
            Specification<MessageRecordEntity> specification = (root, query, builder) -> {
                List<Predicate> predicates = new ArrayList<>();
                predicates.add(builder.equal(root.get("tenantId"), tenantId));
                addEqual(predicates, builder, root.get("recipientId"), recipientId);
                addEqual(predicates, builder, root.get("category"), category);
                addEqual(predicates, builder, root.get("read"), read);
                addEqual(predicates, builder, root.get("archived"), archived);
                addEqual(predicates, builder, root.get("starred"), starred);
                addEqual(predicates, builder, root.get("priority"), priority);
                addSearch(predicates, builder, List.of(
                        root.get("messageNo"), root.get("title"),
                        root.get("recipientName"), root.get("sourceDocumentNo")
                ), search);
                return builder.and(predicates.toArray(Predicate[]::new));
            };
            var springPage = records.findAll(specification, pageable(pageNumber, pageSize)).map(this::toDomain);
            return toStorePage(springPage);
        });
    }

    @Override
    public Optional<MessageRecord> record(String tenantId, String id) {
        return inTenant(tenantId, () -> parseUuid(id).flatMap(records::findById).map(this::toDomain));
    }

    @Override
    public void saveRecord(MessageRecord value) {
        inTenant(value.tenantId(), () -> {
            MessageRecordEntity entity = records
                    .findByTenantIdAndBusinessId(value.tenantId(), value.id())
                    .or(() -> parseUuid(value.id()).flatMap(records::findById))
                    .orElseGet(() -> new MessageRecordEntity(
                            UUID.fromString(value.id()), value.id(), value.tenantId(), value.msgNo(), value.templateCode(),
                            value.category(), value.channel(), value.priority(), value.title(), value.body(),
                            value.recipientId(), value.recipientName(), value.senderId(), value.senderName(),
                            value.sourceType(), value.sourceId(), value.sourceDocNo(), value.isRead(),
                            parseTime(value.readAt()), value.isArchived(), parseTime(value.archivedAt()),
                            value.isStarred(), value.metadata(), value.status(), value.errorMessage(),
                            parseTime(value.sentAt()), parseTime(value.createdAt()), parseTime(value.updatedAt())
                    ));
            entity.apply(value, parseTime(value.updatedAt()));
            records.save(entity);
            return null;
        });
    }

    @Override
    public List<UserPreference> preferences(String tenantId, String userId) {
        return inTenant(tenantId, () -> preferences
                .findByTenantIdAndUserIdOrderByCreatedAtDesc(tenantId, userId)
                .stream().map(this::toDomain).toList());
    }

    @Override
    public Optional<UserPreference> preference(
            String tenantId, String userId, String category, String channel
    ) {
        return inTenant(tenantId, () -> preferences
                .findByTenantIdAndUserIdAndCategoryAndChannel(tenantId, userId, category, channel)
                .map(this::toDomain));
    }

    @Override
    public void savePreference(UserPreference value) {
        inTenant(value.tenantId(), () -> {
            MessagePreferenceEntity entity = preferences
                    .findByTenantIdAndUserIdAndCategoryAndChannel(
                            value.tenantId(), value.userId(), value.category(), value.channel()
                    )
                    .or(() -> preferences.findByTenantIdAndBusinessId(value.tenantId(), value.id()))
                    .orElseGet(() -> new MessagePreferenceEntity(
                            UUID.fromString(value.id()), value.id(), value.tenantId(), value.userId(), value.category(),
                            value.channel(), value.enabled(), value.minPriority(), value.quietHoursStart(),
                            value.quietHoursEnd(), parseTime(value.createdAt()), parseTime(value.updatedAt())
                    ));
            entity.apply(
                    value.enabled(), value.minPriority(), value.quietHoursStart(),
                    value.quietHoursEnd(), parseTime(value.updatedAt())
            );
            preferences.save(entity);
            return null;
        });
    }

    @Override
    public List<Subscription> subscriptions(String tenantId, String userId) {
        return inTenant(tenantId, () -> subscriptions
                .findByTenantIdAndUserIdOrderByCreatedAtDesc(tenantId, userId)
                .stream().map(this::toDomain).toList());
    }

    @Override
    public Optional<Subscription> subscription(String tenantId, String userId, String eventType) {
        return inTenant(tenantId, () -> subscriptions
                .findByTenantIdAndUserIdAndEventType(tenantId, userId, eventType).map(this::toDomain));
    }

    @Override
    public void saveSubscription(Subscription value) {
        inTenant(value.tenantId(), () -> {
            MessageSubscriptionEntity entity = subscriptions
                    .findByTenantIdAndUserIdAndEventType(value.tenantId(), value.userId(), value.eventType())
                    .or(() -> subscriptions.findByTenantIdAndBusinessId(value.tenantId(), value.id()))
                    .orElseGet(() -> new MessageSubscriptionEntity(
                            UUID.fromString(value.id()), value.id(), value.tenantId(), value.userId(), value.eventType(),
                            value.category(), value.enabled(), parseTime(value.createdAt()),
                            parseTime(value.updatedAt())
                    ));
            subscriptions.save(entity);
            return null;
        });
    }

    @Override
    public void deleteSubscription(String tenantId, String id) {
        inTenant(tenantId, () -> {
            parseUuid(id).ifPresent(subscriptions::deleteById);
            return null;
        });
    }

    @Override
    public void addOutbox(OutboxEvent event) {
        inTenant(event.tenantId(), () -> {
            MessageOutboxEntity entity = outbox.findByTenantIdAndEventId(event.tenantId(), event.eventId())
                    .orElseGet(() -> new MessageOutboxEntity(
                            UUID.randomUUID(), event.tenantId(), event.eventId(), event.eventType(),
                            event.aggregateType(), event.aggregateId(), event.aggregateVersion(),
                            event.correlationId(), event.traceId(), event.payload(), event.status(),
                            event.attempts(), event.lastError(), parseTime(event.createdAt())
                    ));
            outbox.save(entity);
            return null;
        });
    }

    @Override
    public List<OutboxEvent> pendingOutbox(String tenantId) {
        return inTenant(tenantId, () -> outbox
                .findByTenantIdAndStatusOrderByCreatedAtAsc(tenantId, "PENDING")
                .stream().map(this::toDomain).toList());
    }

    @Override
    public List<String> pendingOutboxTenantIds() {
        return transactions.execute(status -> {
            entityManager.createNativeQuery(
                    "SELECT set_config(:variable, 'true', true)"
            ).setParameter("variable", BOOTSTRAP_VARIABLE).getSingleResult();
            return List.copyOf(outbox.findDistinctTenantIdsByStatus("PENDING"));
        });
    }

    @Override
    public void markOutboxPublished(String tenantId, String eventId) {
        inTenant(tenantId, () -> {
            outbox.findByTenantIdAndEventId(tenantId, eventId).ifPresent(MessageOutboxEntity::publish);
            return null;
        });
    }

    @Override
    public void markOutboxFailed(String tenantId, String eventId, String error, int maxAttempts) {
        inTenant(tenantId, () -> {
            outbox.findByTenantIdAndEventId(tenantId, eventId).ifPresent(event -> event.fail(error, maxAttempts));
            return null;
        });
    }

    @Override
    public void addAuditLog(AuditLog log) {
        inTenant(log.tenantId(), () -> {
            auditLogs.save(new MessageAuditLogEntity(
                    UUID.fromString(log.id()), log.tenantId(), log.aggregateType(), log.aggregateId(),
                    log.aggregateVersion(), log.action(), log.before(), log.after(),
                    log.correlationId(), log.traceId(), log.actorId(), parseTime(log.occurredAt())
            ));
            return null;
        });
    }

    @Override
    public Optional<IdempotencyRecord> idempotency(String tenantId, String commandType, String key) {
        return inTenant(tenantId, () -> idempotencyRecords
                .findByTenantIdAndCommandTypeAndIdempotencyKey(tenantId, commandType, key)
                .map(entity -> new IdempotencyRecord(
                        entity.requestHash(), entity.responseStatus(), entity.responseBody()
                )));
    }

    @Override
    public void saveIdempotency(
            String tenantId, String commandType, String key, String requestHash,
            int statusCode, Object responseBody
    ) {
        inTenant(tenantId, () -> {
            boolean exists = idempotencyRecords
                    .findByTenantIdAndCommandTypeAndIdempotencyKey(tenantId, commandType, key)
                    .isPresent();
            if (!exists) {
                idempotencyRecords.save(new MessageIdempotencyEntity(
                        UUID.randomUUID(), tenantId, commandType, key, requestHash,
                        statusCode, responseBody, "", Instant.now()
                ));
            }
            return null;
        });
    }

    private <T> T inTenant(String tenantId, Supplier<T> work) {
        return transactions.execute(status -> {
            bindTenant(tenantId);
            return work.get();
        });
    }

    private void bindTenant(String tenantId) {
        entityManager.createNativeQuery("SELECT set_config(:variable, :tenantId, true)")
                .setParameter("variable", TENANT_VARIABLE)
                .setParameter("tenantId", tenantId)
                .executeUpdate();
    }

    private static void addEqual(
            List<Predicate> predicates, jakarta.persistence.criteria.CriteriaBuilder builder,
            jakarta.persistence.criteria.Path<?> path, Object value
    ) {
        if (value != null) predicates.add(builder.equal(path, value));
    }

    private static void addSearch(
            List<Predicate> predicates, jakarta.persistence.criteria.CriteriaBuilder builder,
            List<jakarta.persistence.criteria.Path<String>> paths, String search
    ) {
        if (search == null || search.isBlank()) return;
        String pattern = "%" + search.toLowerCase() + "%";
        List<Predicate> matches = paths.stream()
                .map(path -> builder.like(builder.lower(path), pattern))
                .toList();
        predicates.add(builder.or(matches.toArray(Predicate[]::new)));
    }

    private static PageRequest pageable(Integer pageNumber, Integer pageSize) {
        int safePage = pageNumber == null || pageNumber < 1 ? 1 : pageNumber;
        int safeSize = pageSize == null || pageSize < 1 ? 20 : Math.min(pageSize, 1000);
        return PageRequest.of(safePage - 1, safeSize, Sort.by(Sort.Direction.DESC, "createdAt"));
    }

    private static <T> AbstractMessageStore.Page<T> toStorePage(
            org.springframework.data.domain.Page<T> values
    ) {
        return new AbstractMessageStore.Page<>(List.copyOf(values.getContent()), (int) values.getTotalElements());
    }

    private static Optional<UUID> parseUuid(String value) {
        try {
            return Optional.of(UUID.fromString(value));
        } catch (RuntimeException exception) {
            return Optional.empty();
        }
    }

    private static Instant parseTime(String value) {
        return value == null || value.isBlank() ? null : Instant.parse(value);
    }

    private Template toDomain(MessageTemplateEntity entity) {
        return new Template(
                entity.businessId(), entity.tenantId(), entity.code(), entity.name(),
                entity.category(), entity.channel(), entity.titleTemplate(), entity.bodyTemplate(),
                List.copyOf(entity.variables()), entity.priority(), entity.active(), entity.remark(),
                (int) entity.rowVersion(), format(entity.createdAt()), format(entity.updatedAt()),
                entity.createdBy()
        );
    }

    private MessageRecord toDomain(MessageRecordEntity entity) {
        return new MessageRecord(
                entity.businessId(), entity.tenantId(), entity.messageNo(), entity.templateCode(),
                entity.category(), entity.channel(), entity.priority(), entity.title(), entity.body(),
                entity.recipientId(), entity.recipientName(), entity.senderId(), entity.senderName(),
                entity.sourceType(), entity.sourceId(), entity.sourceDocumentNo(), entity.read(),
                format(entity.readAt()), entity.archived(), format(entity.archivedAt()), entity.starred(),
                entity.metadata(), entity.status(), entity.errorMessage(), format(entity.sentAt()),
                (int) entity.rowVersion(), format(entity.createdAt()), format(entity.updatedAt())
        );
    }

    private UserPreference toDomain(MessagePreferenceEntity entity) {
        return new UserPreference(
                entity.businessId(), entity.tenantId(), entity.userId(), entity.category(),
                entity.channel(), entity.enabled(), entity.minimumPriority(),
                entity.quietHoursStart(), entity.quietHoursEnd(), (int) entity.rowVersion(),
                format(entity.createdAt()), format(entity.updatedAt())
        );
    }

    private Subscription toDomain(MessageSubscriptionEntity entity) {
        return new Subscription(
                entity.businessId(), entity.tenantId(), entity.userId(), entity.eventType(),
                entity.category(), entity.enabled(), (int) entity.rowVersion(),
                format(entity.createdAt()), format(entity.updatedAt())
        );
    }

    private OutboxEvent toDomain(MessageOutboxEntity entity) {
        return new OutboxEvent(
                entity.eventId(), entity.tenantId(), entity.eventType(), entity.aggregateType(),
                entity.aggregateId(), (int) entity.aggregateVersion(), entity.correlationId(),
                entity.traceId(), entity.payload(), entity.status(), entity.attempts(),
                entity.lastError(), format(entity.createdAt())
        );
    }

    private String format(Instant value) { return value == null ? null : value.toString(); }
}
