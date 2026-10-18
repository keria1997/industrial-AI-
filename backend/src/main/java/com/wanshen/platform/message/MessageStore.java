package com.wanshen.platform.message;

import com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord;
import com.wanshen.platform.message.domain.MessageAuditEntry;
import com.wanshen.platform.message.domain.MessageOutboxEvent;

import java.util.*;
import java.util.function.Supplier;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

public class MessageStore implements AbstractMessageStore {
    private final Map<String, Template> templates = new ConcurrentHashMap<>();
    private final Map<String, MessageRecord> records = new ConcurrentHashMap<>();
    private final Map<String, UserPreference> preferences = new ConcurrentHashMap<>();
    private final Map<String, Subscription> subscriptions = new ConcurrentHashMap<>();
    private final Map<String, MessageOutboxEvent> outbox = new ConcurrentHashMap<>();
    private final List<MessageAuditEntry> auditLogs = Collections.synchronizedList(new ArrayList<>());
    private final Map<String, IdempotencyRecord> idempotency = new ConcurrentHashMap<>();

    @Override
    public synchronized <T> T transaction(Supplier<T> work) { return work.get(); }

    @Override
    public synchronized Page<Template> templates(
            String tenantId, Integer page, Integer pageSize, String category,
            String channel, Boolean isActive, String search
    ) {
        List<Template> values = templates.values().stream()
                .filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> category == null || item.category().equals(category))
                .filter(item -> channel == null || item.channel().equals(channel))
                .filter(item -> isActive == null || item.isActive() == isActive)
                .filter(item -> matches(search, item.code(), item.name()))
                .sorted(Comparator.comparing(Template::createdAt).reversed())
                .collect(Collectors.toList());
        return page(values, page, pageSize);
    }

    @Override
    public Optional<Template> template(String tenantId, String id) {
        return Optional.ofNullable(templates.get(key(tenantId, id)));
    }

    @Override
    public Optional<Template> templateByCode(String tenantId, String code) {
        return templates.values().stream()
                .filter(item -> item.tenantId().equals(tenantId) && item.code().equals(code))
                .findFirst();
    }

    @Override
    public void saveTemplate(Template value) { templates.put(key(value.tenantId(), value.id()), value); }
    @Override
    public void deleteTemplate(String tenantId, String id) { templates.remove(key(tenantId, id)); }

    @Override
    public synchronized Page<MessageRecord> records(
            String tenantId, Integer page, Integer pageSize, String recipientId,
            String category, Boolean isRead, Boolean isArchived, Boolean isStarred,
            String priority, String search
    ) {
        List<MessageRecord> values = records.values().stream()
                .filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> recipientId == null || item.recipientId().equals(recipientId))
                .filter(item -> category == null || item.category().equals(category))
                .filter(item -> isRead == null || item.isRead() == isRead)
                .filter(item -> isArchived == null || item.isArchived() == isArchived)
                .filter(item -> isStarred == null || item.isStarred() == isStarred)
                .filter(item -> priority == null || item.priority().equals(priority))
                .filter(item -> matches(search, item.msgNo(), item.title(), item.recipientName(), item.sourceDocNo()))
                .sorted(Comparator.comparing(MessageRecord::createdAt).reversed())
                .collect(Collectors.toList());
        return page(values, page, pageSize);
    }

    @Override
    public Optional<MessageRecord> record(String tenantId, String id) {
        return Optional.ofNullable(records.get(key(tenantId, id)));
    }

    @Override
    public void saveRecord(MessageRecord value) { records.put(key(value.tenantId(), value.id()), value); }

    @Override
    public List<UserPreference> preferences(String tenantId, String userId) {
        return preferences.values().stream()
                .filter(item -> item.tenantId().equals(tenantId) && item.userId().equals(userId))
                .sorted(Comparator.comparing(UserPreference::createdAt).reversed())
                .toList();
    }

    @Override
    public Optional<UserPreference> preference(String tenantId, String userId, String category, String channel) {
        return Optional.ofNullable(preferences.get(preferenceKey(tenantId, userId, category, channel)));
    }

    @Override
    public void savePreference(UserPreference value) {
        preferences.put(preferenceKey(value.tenantId(), value.userId(), value.category(), value.channel()), value);
    }

    @Override
    public List<Subscription> subscriptions(String tenantId, String userId) {
        return subscriptions.values().stream()
                .filter(item -> item.tenantId().equals(tenantId) && item.userId().equals(userId))
                .sorted(Comparator.comparing(Subscription::createdAt).reversed())
                .toList();
    }

    @Override
    public Optional<Subscription> subscription(String tenantId, String userId, String eventType) {
        return Optional.ofNullable(subscriptions.get(subscriptionKey(tenantId, userId, eventType)));
    }

    @Override
    public void saveSubscription(Subscription value) {
        subscriptions.put(subscriptionKey(value.tenantId(), value.userId(), value.eventType()), value);
    }

    @Override
    public void deleteSubscription(String tenantId, String id) {
        subscriptions.values().stream()
                .filter(item -> item.tenantId().equals(tenantId) && item.id().equals(id))
                .findFirst()
                .ifPresent(item -> subscriptions.remove(subscriptionKey(
                        item.tenantId(), item.userId(), item.eventType()
                )));
    }

    @Override
    public void addOutbox(MessageOutboxEvent event) { outbox.put(key(event.tenantId(), event.eventId()), event); }

    @Override
    public synchronized List<MessageOutboxEvent> pendingOutbox(String tenantId) {
        return outbox.values().stream()
                .filter(event -> "PENDING".equals(event.status()) && event.tenantId().equals(tenantId))
                .sorted(Comparator.comparing(MessageOutboxEvent::createdAt))
                .toList();
    }

    @Override
    public synchronized List<String> pendingOutboxTenantIds() {
        return outbox.values().stream()
                .filter(event -> "PENDING".equals(event.status()))
                .map(MessageOutboxEvent::tenantId)
                .distinct()
                .sorted()
                .toList();
    }

    @Override
    public synchronized void markOutboxPublished(String tenantId, String eventId) {
        MessageOutboxEvent event = outbox.get(key(tenantId, eventId));
        if (event == null) return;
        outbox.put(key(tenantId, eventId), new MessageOutboxEvent(
                event.eventId(), event.tenantId(), event.eventType(), event.aggregateType(),
                event.aggregateId(), event.aggregateVersion(), event.correlationId(), event.traceId(),
                event.payload(), "PUBLISHED", event.attempts(), event.lastError(), event.createdAt()
        ));
    }

    @Override
    public synchronized void markOutboxFailed(String tenantId, String eventId, String error, int maxAttempts) {
        MessageOutboxEvent event = outbox.get(key(tenantId, eventId));
        if (event == null) return;
        int attempts = event.attempts() + 1;
        outbox.put(key(tenantId, eventId), new MessageOutboxEvent(
                event.eventId(), event.tenantId(), event.eventType(), event.aggregateType(),
                event.aggregateId(), event.aggregateVersion(), event.correlationId(), event.traceId(),
                event.payload(), attempts >= maxAttempts ? "DEAD_LETTER" : "PENDING", attempts,
                error, event.createdAt()
        ));
    }

    @Override
    public void addAuditLog(MessageAuditEntry log) { auditLogs.add(log); }

    @Override
    public Optional<IdempotencyRecord> idempotency(String tenantId, String commandType, String key) {
        return Optional.ofNullable(idempotency.get(idempotencyKey(tenantId, commandType, key)));
    }

    @Override
    public void saveIdempotency(
            String tenantId, String commandType, String key, String requestHash,
            int statusCode, Object body
    ) {
        idempotency.put(idempotencyKey(tenantId, commandType, key),
                new IdempotencyRecord(requestHash, statusCode, body));
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
        return Arrays.stream(fields).filter(Objects::nonNull)
                .anyMatch(field -> field.toLowerCase().contains(query.toLowerCase()));
    }

    private String key(String tenantId, String id) { return tenantId + ":" + id; }
    private String preferenceKey(String tenantId, String userId, String category, String channel) {
        return tenantId + ":" + userId + ":" + category + ":" + channel;
    }
    private String subscriptionKey(String tenantId, String userId, String eventType) {
        return tenantId + ":" + userId + ":" + eventType;
    }
    private String idempotencyKey(String tenantId, String commandType, String key) {
        return tenantId + ":" + commandType + ":" + key;
    }
}
