package com.wanshen.platform.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.wanshen.platform.message.domain.MessageAuditEntry;
import com.wanshen.platform.message.domain.MessageAuditState;
import com.wanshen.platform.message.domain.MessageMetadata;
import com.wanshen.platform.message.domain.MessageOutboxEvent;
import com.wanshen.platform.message.domain.MessageOutboxPayload;
import com.wanshen.platform.storage.JdbcModuleStoreSupport;
import com.wanshen.platform.storage.ModuleInfra.AuditLog;
import com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord;
import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;

import javax.sql.DataSource;
import java.util.LinkedHashMap;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class JdbcMessageStore extends JdbcModuleStoreSupport implements AbstractMessageStore {
    private static final int PAGE_SIZE = 10;

    public JdbcMessageStore(DataSource dataSource, ObjectMapper objectMapper) {
        super(dataSource, objectMapper, "message");
    }

    @Override
    public Page<Template> templates(
            String tenantId, Integer page, Integer pageSize, String category,
            String channel, Boolean isActive, String search
    ) {
        List<Template> values = documents(tenantId, "template", Template.class).stream()
                .filter(item -> category == null || item.category().equals(category))
                .filter(item -> channel == null || item.channel().equals(channel))
                .filter(item -> isActive == null || item.isActive() == isActive)
                .filter(item -> matches(search, item.code(), item.name()))
                .sorted(Comparator.comparing(Template::createdAt).reversed())
                .toList();
        return page(values, page, pageSize);
    }

    @Override
    public Optional<Template> template(String tenantId, String id) {
        return document(tenantId, "template", id, Template.class);
    }

    @Override
    public Optional<Template> templateByCode(String tenantId, String code) {
        return documents(tenantId, "template", Template.class).stream()
                .filter(item -> item.code().equals(code))
                .findFirst();
    }

    @Override
    public void saveTemplate(Template value) { putDocument(value.tenantId(), "template", value.id(), value); }
    @Override
    public void deleteTemplate(String tenantId, String id) { deleteDocument(tenantId, "template", id); }

    @Override
    public Page<MessageRecord> records(
            String tenantId, Integer page, Integer pageSize, String recipientId,
            String category, Boolean isRead, Boolean isArchived, Boolean isStarred,
            String priority, String search
    ) {
        List<MessageRecord> values = documents(tenantId, "record", MessageRecord.class).stream()
                .filter(item -> recipientId == null || item.recipientId().equals(recipientId))
                .filter(item -> category == null || item.category().equals(category))
                .filter(item -> isRead == null || item.isRead() == isRead)
                .filter(item -> isArchived == null || item.isArchived() == isArchived)
                .filter(item -> isStarred == null || item.isStarred() == isStarred)
                .filter(item -> priority == null || item.priority().equals(priority))
                .filter(item -> matches(search, item.msgNo(), item.title(), item.recipientName(), item.sourceDocNo()))
                .sorted(Comparator.comparing(MessageRecord::createdAt).reversed())
                .toList();
        return page(values, page, pageSize);
    }

    @Override
    public Optional<MessageRecord> record(String tenantId, String id) {
        return document(tenantId, "record", id, MessageRecord.class);
    }

    @Override
    public void saveRecord(MessageRecord value) { putDocument(value.tenantId(), "record", value.id(), value); }

    @Override
    public List<UserPreference> preferences(String tenantId, String userId) {
        return documents(tenantId, "preference", UserPreference.class).stream()
                .filter(item -> item.userId().equals(userId))
                .sorted(Comparator.comparing(UserPreference::createdAt).reversed())
                .toList();
    }

    @Override
    public Optional<UserPreference> preference(String tenantId, String userId, String category, String channel) {
        return documents(tenantId, "preference", UserPreference.class).stream()
                .filter(item -> item.userId().equals(userId) && item.category().equals(category)
                        && item.channel().equals(channel))
                .findFirst();
    }

    @Override
    public void savePreference(UserPreference value) {
        putDocument(value.tenantId(), "preference", value.id(), value);
    }

    @Override
    public List<Subscription> subscriptions(String tenantId, String userId) {
        return documents(tenantId, "subscription", Subscription.class).stream()
                .filter(item -> item.userId().equals(userId))
                .sorted(Comparator.comparing(Subscription::createdAt).reversed())
                .toList();
    }

    @Override
    public Optional<Subscription> subscription(String tenantId, String userId, String eventType) {
        return documents(tenantId, "subscription", Subscription.class).stream()
                .filter(item -> item.userId().equals(userId) && item.eventType().equals(eventType))
                .findFirst();
    }

    @Override
    public void saveSubscription(Subscription value) {
        putDocument(value.tenantId(), "subscription", value.id(), value);
    }

    @Override
    public void deleteSubscription(String tenantId, String id) {
        deleteDocument(tenantId, "subscription", id);
    }

    @Override
    public void addOutbox(MessageOutboxEvent event) {
        super.addOutbox(new OutboxEvent(
                event.eventId(), event.tenantId(), event.eventType(), event.aggregateType(),
                event.aggregateId(), event.aggregateVersion(), event.correlationId(), event.traceId(),
                legacyPayload(event.payload()), event.status(), event.attempts(),
                event.lastError(), event.createdAt()
        ));
    }

    public List<MessageOutboxEvent> pendingOutbox(String tenantId) {
        return pendingLegacyEvents(tenantId).stream().map(this::messageEvent).toList();
    }

    @Override
    public void addAuditLog(MessageAuditEntry log) {
        super.addAuditLog(new AuditLog(
                log.id(), log.tenantId(), log.aggregateType(), log.aggregateId(),
                log.aggregateVersion(), log.action(), log.actorId(), legacyAuditState(log.before()),
                legacyAuditState(log.after()), log.correlationId(), log.traceId(), log.occurredAt()
        ));
    }

    private Map<String, Object> legacyPayload(MessageOutboxPayload payload) {
        return objectMapper().convertValue(payload == null ? MessageOutboxPayload.empty() : payload,
                new TypeReference<LinkedHashMap<String, Object>>() {});
    }

    private Object legacyAuditState(MessageAuditState state) {
        return objectMapper().convertValue(state == null ? MessageAuditState.empty() : state,
                new TypeReference<LinkedHashMap<String, Object>>() {});
    }

    private List<OutboxEvent> pendingLegacyEvents(String tenantId) {
        return super.pendingModuleOutbox(tenantId);
    }

    private MessageOutboxEvent messageEvent(OutboxEvent event) {
        MessageOutboxPayload payload = objectMapper().convertValue(
                event.payload() == null ? Map.of() : event.payload(), MessageOutboxPayload.class
        );
        return new MessageOutboxEvent(
                event.eventId(), event.tenantId(), event.eventType(), event.aggregateType(),
                event.aggregateId(), event.aggregateVersion(), event.correlationId(), event.traceId(),
                payload, event.status(), event.attempts(), event.lastError(), event.createdAt()
        );
    }

    private <T> Page<T> page(List<T> values, Integer page, Integer pageSize) {
        int safePage = page == null || page < 1 ? 1 : page;
        int safeSize = pageSize == null || pageSize < 1 ? 20 : pageSize;
        int from = Math.min((safePage - 1) * safeSize, values.size());
        int to = Math.min(from + safeSize, values.size());
        return new Page<>(List.copyOf(values.subList(from, to)), values.size());
    }

    private boolean matches(String query, String... fields) {
        if (query == null || query.isBlank()) return true;
        for (String field : fields) {
            if (field != null && field.toLowerCase().contains(query.toLowerCase())) return true;
        }
        return false;
    }
}
