package com.wanshen.platform.message.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.message.AbstractMessageStore;
import com.wanshen.platform.message.AbstractMessageStore.MessageRecord;
import com.wanshen.platform.message.AbstractMessageStore.Page;
import com.wanshen.platform.message.AbstractMessageStore.Subscription;
import com.wanshen.platform.message.AbstractMessageStore.Template;
import com.wanshen.platform.message.AbstractMessageStore.TemplateVariable;
import com.wanshen.platform.message.AbstractMessageStore.UserPreference;
import com.wanshen.platform.message.application.result.MessageCommandResult;
import com.wanshen.platform.message.application.result.MessageCommandResults;
import com.wanshen.platform.message.application.result.MessageDashboardResponse;
import com.wanshen.platform.message.application.MessageCommands.MessageActor;
import com.wanshen.platform.message.domain.MessageAuditEntry;
import com.wanshen.platform.message.domain.MessageAuditField;
import com.wanshen.platform.message.domain.MessageAuditState;
import com.wanshen.platform.message.domain.MessageMetadata;
import com.wanshen.platform.message.domain.MessageOutboxEvent;
import com.wanshen.platform.message.domain.MessageOutboxPayload;
import com.wanshen.platform.message.domain.MessageVariableBindings;
import com.wanshen.platform.web.ApiException;
import org.springframework.stereotype.Service;

import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

/** Orchestrates message use cases, transaction boundaries, audit and outbox publication. */
@Service
public class MessageApplicationService {
    private static final List<String> CATEGORIES = List.of(
            "order", "payment", "shipping", "inventory", "production", "procurement", "finance", "system"
    );
    private static final List<String> CHANNELS = List.of("in_app", "email", "sms", "webhook");
    private static final List<String> PRIORITIES = List.of("urgent", "high", "normal", "low");

    private final AbstractMessageStore store;
    private final ObjectMapper objectMapper;

    public MessageApplicationService(AbstractMessageStore store, ObjectMapper objectMapper) {
        this.store = store;
        this.objectMapper = objectMapper;
    }

    public Page<Template> templates(MessageActor actor, MessageCommands.TemplateSearch search) {
        require(actor, "message.template.read");
        validatePage(search.page(), search.pageSize());
        validateEnum(search.category(), CATEGORIES, "category");
        validateEnum(search.channel(), CHANNELS, "channel");
        return store.templates(actor.tenantId(), search.page(), search.pageSize(),
                search.category(), search.channel(), search.isActive(), search.search());
    }

    public Template template(MessageActor actor, String id) {
        require(actor, "message.template.read");
        validateUuid(id);
        return template(actor.tenantId(), id);
    }

    public MessageCommandResult<Template> createTemplate(
            MessageActor actor, MessageCommands.CreateTemplate command
    ) {
        require(actor, "message.template.create");
        validateEnum(command.category(), CATEGORIES, "category");
        validateEnum(command.channel(), CHANNELS, "channel");
        validateEnum(command.priority(), PRIORITIES, "priority");
        return command(actor, "message.template.create", command, () -> {
            if (store.templateByCode(actor.tenantId(), command.code()).isPresent()) {
                throw conflict("模板编码已存在", "使用不同的模板编码");
            }
            String timestamp = now();
            String id = UUID.randomUUID().toString();
            Template template = new Template(
                    id, actor.tenantId(), command.code(), command.name(), command.category(),
                    command.channel(), command.titleTemplate(), command.bodyTemplate(),
                    templateVariables(command.variables()), defaultText(command.priority(), "normal"),
                    true, defaultText(command.remark(), ""), 1, timestamp, timestamp, actor.actorId()
            );
            store.saveTemplate(template);
            audit(actor, "MessageTemplate", id, 1, "CREATE", null, templateAudit(template));
            outbox(actor, "message.template.created.v1", "MessageTemplate", id, 1,
                    new MessageOutboxPayload(null, null, null, null, id, command.code()));
            return new MessageCommandResults.TemplateCreated(template);
        });
    }

    public MessageCommandResult<Template> updateTemplate(
            MessageActor actor, MessageCommands.UpdateTemplate command
    ) {
        require(actor, "message.template.update");
        validateUuid(command.id());
        validateEnum(command.category(), CATEGORIES, "category");
        validateEnum(command.channel(), CHANNELS, "channel");
        validateEnum(command.priority(), PRIORITIES, "priority");
        if (command.empty()) throw invalid("至少提供一个更新字段");
        return command(actor, "message.template.update", command, () -> {
            Template current = template(actor.tenantId(), command.id());
            requireVersion(actor, current.version());
            Template updated = new Template(
                    current.id(), current.tenantId(), current.code(),
                    updatedText(command.name(), current.name()),
                    updatedText(command.category(), current.category()),
                    updatedText(command.channel(), current.channel()),
                    updatedText(command.titleTemplate(), current.titleTemplate()),
                    updatedText(command.bodyTemplate(), current.bodyTemplate()),
                    command.variables() == null ? current.variables() : templateVariables(command.variables()),
                    updatedText(command.priority(), current.priority()),
                    command.isActive() == null || command.isActive(),
                    updatedText(command.remark(), current.remark()), current.version() + 1,
                    current.createdAt(), now(), current.createdBy()
            );
            store.saveTemplate(updated);
            audit(actor, "MessageTemplate", updated.id(), updated.version(), "UPDATE",
                    templateAudit(current), templateAudit(updated));
            return new MessageCommandResults.TemplateUpdated(updated);
        });
    }

    public MessageCommandResult<Boolean> deleteTemplate(MessageActor actor, String id) {
        require(actor, "message.template.delete");
        validateUuid(id);
        return command(actor, "message.template.delete", new MessageCommands.DeleteTemplate(id), () -> {
            Template current = template(actor.tenantId(), id);
            requireVersion(actor, current.version());
            store.deleteTemplate(actor.tenantId(), id);
            audit(actor, "MessageTemplate", id, current.version(), "DELETE", templateAudit(current), null);
            return new MessageCommandResults.TemplateDeleted(true);
        });
    }

    public Page<MessageRecord> messages(MessageActor actor, MessageCommands.MessageSearch search) {
        require(actor, "message.read");
        validatePage(search.page(), search.pageSize());
        validateEnum(search.category(), CATEGORIES, "category");
        validateEnum(search.priority(), PRIORITIES, "priority");
        return store.records(actor.tenantId(), search.page(), search.pageSize(), search.recipientId(),
                search.category(), search.isRead(), search.isArchived(), search.isStarred(),
                search.priority(), search.search());
    }

    public MessageRecord message(MessageActor actor, String id) {
        require(actor, "message.read");
        validateUuid(id);
        return message(actor.tenantId(), id);
    }

    public MessageCommandResult<MessageCommandResults.MessageSent> send(
            MessageActor actor, MessageCommands.SendMessage command
    ) {
        require(actor, "message.send");
        validateEnum(command.category(), CATEGORIES, "category");
        validateEnum(command.channel(), CHANNELS, "channel");
        validateEnum(command.priority(), PRIORITIES, "priority");
        return command(actor, "message.send", command, () -> {
            ResolvedMessage resolved = resolveMessage(actor, command.templateCode(), command.title(),
                    command.body(), command.category(), command.channel(), command.priority(), command.variables());
            Optional<UserPreference> preference = store.preference(
                    actor.tenantId(), command.recipientId(), resolved.category(), resolved.channel()
            );
            if (preference.isPresent() && !preference.get().enabled()) {
                return MessageCommandResults.MessageSent.skipped("user_preference_disabled");
            }
            if (preference.isPresent() && priorityRank(resolved.priority()) > priorityRank(preference.get().minPriority())) {
                return MessageCommandResults.MessageSent.skipped("priority_below_threshold");
            }
            MessageRecord message = messageRecord(actor, command.recipientId(), command.recipientName(),
                    command.sourceType(), command.sourceId(), command.sourceDocNo(), command.metadata(), resolved);
            store.saveRecord(message);
            audit(actor, "MessageRecord", message.id(), 1, "SEND", null, recordAudit(message));
            outbox(actor, "message.record.sent.v1", "MessageRecord", message.id(), 1,
                    new MessageOutboxPayload(message.id(), message.recipientId(), resolved.category(),
                            resolved.priority(), null, null));
            return MessageCommandResults.MessageSent.created(message);
        });
    }

    public MessageCommandResult<MessageCommandResults.MessageBatchSent> sendBatch(
            MessageActor actor, MessageCommands.SendBatchMessage command
    ) {
        require(actor, "message.send");
        validateEnum(command.category(), CATEGORIES, "category");
        validateEnum(command.channel(), CHANNELS, "channel");
        validateEnum(command.priority(), PRIORITIES, "priority");
        return command(actor, "message.sendBatch", command, () -> {
            ResolvedMessage resolved = resolveMessage(actor, command.templateCode(), command.title(),
                    command.body(), command.category(), command.channel(), command.priority(), command.variables());
            List<MessageRecord> sent = new ArrayList<>();
            for (String recipientId : command.recipientIds()) {
                Optional<UserPreference> preference = store.preference(
                        actor.tenantId(), recipientId, resolved.category(), resolved.channel()
                );
                if (preference.isPresent() && (!preference.get().enabled()
                        || priorityRank(resolved.priority()) > priorityRank(preference.get().minPriority()))) {
                    continue;
                }
                MessageRecord message = messageRecord(actor, recipientId, null, command.sourceType(),
                        command.sourceId(), command.sourceDocNo(), command.metadata(), resolved);
                store.saveRecord(message);
                outbox(actor, "message.record.sent.v1", "MessageRecord", message.id(), 1,
                        new MessageOutboxPayload(message.id(), recipientId, resolved.category(),
                                resolved.priority(), null, null));
                sent.add(message);
            }
            audit(actor, "MessageRecord", "batch", 1, "SEND_BATCH", null,
                    auditState(new MessageAuditField("count", String.valueOf(sent.size()))));
            return new MessageCommandResults.MessageBatchSent(
                    sent, sent.size(), command.recipientIds().size() - sent.size()
            );
        });
    }

    public MessageCommandResult<Integer> markAllRead(MessageActor actor, String recipientId) {
        require(actor, "message.read");
        if (recipientId == null || recipientId.isBlank() || recipientId.length() > 100) throw invalid("recipientId 不合法");
        return command(actor, "message.markAllRead", new MessageCommands.MarkAllRead(recipientId), () -> {
            int marked = 0;
            String timestamp = now();
            for (MessageRecord current : store.records(actor.tenantId(), 1, 10000,
                    recipientId, null, false, null, null, null, null).items()) {
                store.saveRecord(current.read(timestamp, timestamp, current.version() + 1));
                marked++;
            }
            audit(actor, "MessageRecord", "bulk", 1, "MARK_ALL_READ", null,
                    auditState(new MessageAuditField("count", String.valueOf(marked))));
            return new MessageCommandResults.MessagesMarkedRead(marked);
        });
    }

    public MessageCommandResult<MessageRecord> markRead(MessageActor actor, String id) {
        require(actor, "message.read");
        validateUuid(id);
        return command(actor, "message.markRead", new MessageCommands.AggregateStateChange(id), () -> {
            MessageRecord current = message(actor.tenantId(), id);
            if (current.isRead()) return new MessageCommandResults.MessageUpdated(current);
            requireVersion(actor, current.version());
            String timestamp = now();
            MessageRecord updated = current.read(timestamp, timestamp, current.version() + 1);
            store.saveRecord(updated);
            audit(actor, "MessageRecord", id, updated.version(), "MARK_READ",
                    recordAudit(current), recordAudit(updated));
            return new MessageCommandResults.MessageUpdated(updated);
        });
    }

    public MessageCommandResult<MessageRecord> archive(MessageActor actor, String id) {
        require(actor, "message.read");
        validateUuid(id);
        return command(actor, "message.archive", new MessageCommands.AggregateStateChange(id), () -> {
            MessageRecord current = message(actor.tenantId(), id);
            requireVersion(actor, current.version());
            String timestamp = now();
            MessageRecord updated = current.archive(timestamp, timestamp, current.version() + 1);
            store.saveRecord(updated);
            audit(actor, "MessageRecord", id, updated.version(), "ARCHIVE",
                    recordAudit(current), recordAudit(updated));
            return new MessageCommandResults.MessageUpdated(updated);
        });
    }

    public MessageCommandResult<MessageRecord> star(MessageActor actor, String id, boolean starred) {
        require(actor, "message.read");
        validateUuid(id);
        return command(actor, "message.star", new MessageCommands.StarMessage(id, starred), () -> {
            MessageRecord current = message(actor.tenantId(), id);
            requireVersion(actor, current.version());
            String timestamp = now();
            MessageRecord updated = current.star(starred, timestamp, current.version() + 1);
            store.saveRecord(updated);
            audit(actor, "MessageRecord", id, updated.version(), starred ? "STAR" : "UNSTAR",
                    recordAudit(current), recordAudit(updated));
            return new MessageCommandResults.MessageUpdated(updated);
        });
    }

    public List<UserPreference> preferences(MessageActor actor, String userId) {
        require(actor, "message.preference.read");
        requireIdentifier("userId", userId, 100);
        return store.preferences(actor.tenantId(), userId);
    }

    public MessageCommandResult<UserPreference> savePreference(
            MessageActor actor, MessageCommands.SavePreference command
    ) {
        require(actor, "message.preference.update");
        validateEnum(command.category(), CATEGORIES, "category");
        validateEnum(command.channel(), CHANNELS, "channel");
        validateEnum(command.minPriority(), PRIORITIES, "minPriority");
        return command(actor, "message.preference.update", command, () -> {
            Optional<UserPreference> current = store.preference(actor.tenantId(), actor.actorId(),
                    command.category(), command.channel());
            String timestamp = now();
            UserPreference saved;
            if (current.isPresent()) {
                requireVersion(actor, current.get().version());
                UserPreference value = current.get();
                saved = new UserPreference(value.id(), value.tenantId(), value.userId(), value.category(),
                        value.channel(), defaultBoolean(command.enabled(), value.enabled()),
                        updatedText(command.minPriority(), value.minPriority()),
                        updatedText(command.quietHoursStart(), value.quietHoursStart()),
                        updatedText(command.quietHoursEnd(), value.quietHoursEnd()),
                        value.version() + 1, value.createdAt(), timestamp);
            } else {
                saved = new UserPreference(UUID.randomUUID().toString(), actor.tenantId(), actor.actorId(),
                        command.category(), command.channel(), defaultBoolean(command.enabled(), true),
                        defaultText(command.minPriority(), "low"), defaultText(command.quietHoursStart(), ""),
                        defaultText(command.quietHoursEnd(), ""), 1, timestamp, timestamp);
            }
            store.savePreference(saved);
            audit(actor, "UserPreference", saved.id(), saved.version(), current.isPresent() ? "UPDATE" : "CREATE",
                    current.map(this::preferenceAudit).orElse(null), preferenceAudit(saved));
            return new MessageCommandResults.PreferenceSaved(saved);
        });
    }

    public List<Subscription> subscriptions(MessageActor actor, String userId) {
        require(actor, "message.subscription.read");
        requireIdentifier("userId", userId, 100);
        return store.subscriptions(actor.tenantId(), userId);
    }

    public MessageCommandResult<Subscription> createSubscription(
            MessageActor actor, MessageCommands.CreateSubscription command
    ) {
        require(actor, "message.subscription.create");
        validateEnum(command.category(), CATEGORIES, "category");
        return command(actor, "message.subscription.create", command, () -> {
            if (store.subscription(actor.tenantId(), actor.actorId(), command.eventType()).isPresent()) {
                throw conflict("已订阅该事件类型", "取消已有订阅后重试");
            }
            String timestamp = now();
            Subscription subscription = new Subscription(UUID.randomUUID().toString(), actor.tenantId(),
                    actor.actorId(), command.eventType(), command.category(),
                    defaultBoolean(command.enabled(), true), 1, timestamp, timestamp);
            store.saveSubscription(subscription);
            audit(actor, "Subscription", subscription.id(), 1, "CREATE", null, subscriptionAudit(subscription));
            return new MessageCommandResults.SubscriptionCreated(subscription);
        });
    }

    public MessageCommandResult<Boolean> deleteSubscription(MessageActor actor, String id) {
        require(actor, "message.subscription.delete");
        validateUuid(id);
        return command(actor, "message.subscription.delete", new MessageCommands.DeleteSubscription(id), () -> {
            Subscription current = store.subscriptions(actor.tenantId(), actor.actorId()).stream()
                    .filter(item -> item.id().equals(id)).findFirst()
                    .orElseThrow(() -> notFound("订阅不存在", "刷新订阅列表后重试"));
            requireVersion(actor, current.version());
            store.deleteSubscription(actor.tenantId(), id);
            audit(actor, "Subscription", id, current.version(), "DELETE", subscriptionAudit(current), null);
            return new MessageCommandResults.SubscriptionDeleted(true);
        });
    }

    public MessageDashboardResponse dashboard(MessageActor actor, String recipientId) {
        require(actor, "message.read");
        if (recipientId != null && recipientId.length() > 100) throw invalid("recipientId 不合法");
        Page<MessageRecord> page = store.records(actor.tenantId(), 1, 1000,
                recipientId, null, null, null, null, null, null);
        List<MessageRecord> unread = page.items().stream().filter(item -> !item.isRead()).toList();
        List<MessageDashboardResponse.MessageCategoryCount> categories = CATEGORIES.stream()
                .map(category -> new MessageDashboardResponse.MessageCategoryCount(category,
                        page.items().stream().filter(item -> item.category().equals(category)).count()))
                .toList();
        List<MessageDashboardResponse.MessagePriorityCount> priorities = PRIORITIES.stream()
                .map(priority -> new MessageDashboardResponse.MessagePriorityCount(priority,
                        page.items().stream().filter(item -> item.priority().equals(priority)).count()))
                .toList();
        return new MessageDashboardResponse(page.total(), unread.size(),
                page.items().stream().filter(MessageRecord::isArchived).count(),
                page.items().stream().filter(MessageRecord::isStarred).count(),
                categories,
                priorities,
                unread.stream().limit(10).toList());
    }

    private <T> MessageCommandResult<T> command(
            MessageActor actor, String commandType, Object request, Supplier<MessageCommandResult<T>> work
    ) {
        if (actor.idempotencyKey() == null || actor.idempotencyKey().isBlank()) {
            throw new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", "写操作缺少幂等键",
                    "提供 X-Idempotency-Key 后重试");
        }
        return store.transaction(() -> {
            String hash = hash(new IdempotentRequest(commandType, request));
            Optional<com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord> replay =
                    store.idempotency(actor.tenantId(), commandType, actor.idempotencyKey());
            if (replay.isPresent()) {
                if (!replay.get().requestHash().equals(hash)) {
                    throw conflict("幂等键已用于不同请求", "为新业务操作使用新的幂等键");
                }
                return new MessageCommandResults.Replay<>(
                        typedResult(replay.get().body(), commandType)
                );
            }
            MessageCommandResult<T> result = work.get();
            store.saveIdempotency(actor.tenantId(), commandType, actor.idempotencyKey(), hash,
                    result.status(), result);
            return result;
        });
    }

    @SuppressWarnings("unchecked")
    private <T> MessageCommandResult<T> typedResult(Object body, String commandType) {
        if (body instanceof MessageCommandResult<?> result) return (MessageCommandResult<T>) result;
        if (body instanceof java.util.Map<?, ?> legacy) {
            return (MessageCommandResult<T>) replayLegacyResult(legacy, commandType);
        }
        throw conflict("历史幂等响应无法重放", "使用新的幂等键重试");
    }

    private MessageCommandResult<?> replayLegacyResult(java.util.Map<?, ?> body, String commandType) {
        return switch (commandType) {
            case "message.template.create" -> objectMapper.convertValue(
                    body, MessageCommandResults.TemplateCreated.class);
            case "message.template.update" -> objectMapper.convertValue(
                    body, MessageCommandResults.TemplateUpdated.class);
            case "message.template.delete", "message.subscription.delete" -> objectMapper.convertValue(
                    body, MessageCommandResults.TemplateDeleted.class);
            case "message.send" -> objectMapper.convertValue(body, MessageCommandResults.MessageSent.class);
            case "message.sendBatch" -> objectMapper.convertValue(
                    body, MessageCommandResults.MessageBatchSent.class);
            case "message.markAllRead" -> objectMapper.convertValue(
                    body, MessageCommandResults.MessagesMarkedRead.class);
            case "message.markRead", "message.archive", "message.star" -> objectMapper.convertValue(
                    body, MessageCommandResults.MessageUpdated.class);
            case "message.preference.update" -> objectMapper.convertValue(
                    body, MessageCommandResults.PreferenceSaved.class);
            case "message.subscription.create" -> objectMapper.convertValue(
                    body, MessageCommandResults.SubscriptionCreated.class);
            default -> throw conflict("历史幂等响应无法重放", "使用新的幂等键重试");
        };
    }

    private ResolvedMessage resolveMessage(
            MessageActor actor, String templateCode, String title, String body,
            String category, String channel, String priority, MessageVariableBindings bindings
    ) {
        String resolvedTitle = title;
        String resolvedBody = body;
        String resolvedCategory = category;
        String resolvedChannel = defaultText(channel, "in_app");
        String resolvedPriority = defaultText(priority, "normal");
        String resolvedTemplateCode = null;
        if (templateCode != null && !templateCode.isBlank()) {
            Template template = store.templateByCode(actor.tenantId(), templateCode)
                    .orElseThrow(() -> notFound("消息模板不存在", "确认模板编码后重试"));
            if (!template.isActive()) throw conflict("消息模板已停用", "启用模板后重试");
            resolvedTitle = render(template.titleTemplate(), bindings);
            resolvedBody = render(template.bodyTemplate(), bindings);
            resolvedCategory = template.category();
            resolvedChannel = template.channel();
            resolvedPriority = template.priority();
            resolvedTemplateCode = template.code();
        }
        return new ResolvedMessage(resolvedTitle, resolvedBody, resolvedCategory, resolvedChannel,
                resolvedPriority, resolvedTemplateCode);
    }

    private String render(String template, MessageVariableBindings bindings) {
        return java.util.regex.Pattern.compile("\\{\\{(\\w+)\\}\\}").matcher(template)
                .replaceAll(match -> bindings == null ? "" : bindings.bindings().stream()
                        .filter(item -> item.name().equals(match.group(1)))
                        .map(item -> item.value() == null ? "" : item.value())
                        .findFirst().orElse(""));
    }

    private MessageRecord messageRecord(
            MessageActor actor, String recipientId, String recipientName, String sourceType,
            String sourceId, String sourceDocNo, MessageMetadata metadata, ResolvedMessage resolved
    ) {
        String timestamp = now();
        return new MessageRecord(UUID.randomUUID().toString(), actor.tenantId(), nextMessageNo(),
                resolved.templateCode(), resolved.category(), resolved.channel(), resolved.priority(),
                resolved.title(), resolved.body(), recipientId, defaultText(recipientName, ""),
                actor.actorId(), "system".equals(actor.actorId()) ? "系统" : actor.actorId(),
                defaultText(sourceType, ""), defaultText(sourceId, ""), defaultText(sourceDocNo, ""),
                false, null, false, null, false, defaultMetadata(metadata), "sent", "",
                timestamp, 1, timestamp, timestamp);
    }

    private void outbox(
            MessageActor actor, String eventType, String aggregateType, String aggregateId,
            int aggregateVersion, MessageOutboxPayload payload
    ) {
        store.addOutbox(new MessageOutboxEvent(UUID.randomUUID().toString(), actor.tenantId(), eventType,
                aggregateType, aggregateId, aggregateVersion, UUID.randomUUID().toString(),
                actor.traceId(), payload, "PENDING", 0, "", now()));
    }

    private void audit(
            MessageActor actor, String aggregateType, String aggregateId, int version,
            String action, MessageAuditState before, MessageAuditState after
    ) {
        store.addAuditLog(new MessageAuditEntry(UUID.randomUUID().toString(), actor.tenantId(),
                aggregateType, aggregateId, version, action, actor.actorId(), before, after,
                UUID.randomUUID().toString(), actor.traceId(), now()));
    }

    private MessageAuditState templateAudit(Template value) {
        return auditState(
                new MessageAuditField("id", value.id()), new MessageAuditField("code", value.code()),
                new MessageAuditField("name", value.name()), new MessageAuditField("isActive", String.valueOf(value.isActive())),
                new MessageAuditField("version", String.valueOf(value.version())));
    }

    private MessageAuditState recordAudit(MessageRecord value) {
        return auditState(
                new MessageAuditField("id", value.id()), new MessageAuditField("msgNo", value.msgNo()),
                new MessageAuditField("isRead", String.valueOf(value.isRead())),
                new MessageAuditField("isArchived", String.valueOf(value.isArchived())),
                new MessageAuditField("isStarred", String.valueOf(value.isStarred())),
                new MessageAuditField("version", String.valueOf(value.version())));
    }

    private MessageAuditState preferenceAudit(UserPreference value) {
        return auditState(
                new MessageAuditField("id", value.id()), new MessageAuditField("enabled", String.valueOf(value.enabled())),
                new MessageAuditField("version", String.valueOf(value.version())));
    }

    private MessageAuditState subscriptionAudit(Subscription value) {
        return auditState(
                new MessageAuditField("id", value.id()), new MessageAuditField("eventType", value.eventType()),
                new MessageAuditField("enabled", String.valueOf(value.enabled())),
                new MessageAuditField("version", String.valueOf(value.version())));
    }

    private MessageAuditState auditState(MessageAuditField... fields) {
        return new MessageAuditState(List.of(fields));
    }

    private void require(MessageActor actor, String permission) {
        if (!actor.has(permission)) {
            throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED",
                    "缺少操作权限：" + permission, "请联系管理员授予对应消息权限");
        }
    }

    private void requireVersion(MessageActor actor, int actual) {
        if (actor.expectedVersion() == null) {
            throw new ApiException(409, "PRODUCTION_409_VERSION_CONFLICT", "缺少聚合版本",
                    "刷新数据后重新确认操作", List.of(), new VersionConflictDetails(null, actual));
        }
        if (actor.expectedVersion() != actual) {
            throw versionConflict(new VersionConflictDetails(actor.expectedVersion(), actual));
        }
    }

    private void validatePage(Integer page, Integer pageSize) {
        if (page != null && page < 1) throw invalid("页码必须大于等于 1");
        if (pageSize != null && (pageSize < 1 || pageSize > 200)) throw invalid("每页数量必须在 1-200 之间");
    }

    private void validateEnum(String value, List<String> values, String field) {
        if (value != null && !values.contains(value)) throw invalid(field + " 不合法");
    }

    private void requireIdentifier(String field, String value, int maxLength) {
        if (value == null || value.isBlank() || value.length() > maxLength) throw invalid(field + " 不合法");
    }

    private void validateUuid(String value) {
        try {
            UUID.fromString(value);
        } catch (RuntimeException exception) {
            throw invalid("ID 必须是 UUID");
        }
    }

    private Template template(String tenantId, String id) {
        return store.template(tenantId, id).orElseThrow(() -> notFound("消息模板不存在", "刷新模板列表后重试"));
    }

    private MessageRecord message(String tenantId, String id) {
        return store.record(tenantId, id).orElseThrow(() -> notFound("消息不存在", "刷新消息列表后重试"));
    }

    private List<TemplateVariable> templateVariables(List<MessageCommands.TemplateVariable> values) {
        if (values == null) return List.of();
        return values.stream().map(value -> new TemplateVariable(value.name(), value.desc())).toList();
    }

    private static MessageMetadata defaultMetadata(MessageMetadata value) {
        return value == null ? MessageMetadata.empty() : value;
    }

    private static String updatedText(String value, String fallback) { return value == null ? fallback : value; }
    private static String defaultText(String value, String fallback) { return value == null || value.isBlank() ? fallback : value; }
    private static boolean defaultBoolean(Boolean value, boolean fallback) { return value == null ? fallback : value; }
    private static int priorityRank(String priority) {
        return switch (priority) { case "urgent" -> 0; case "high" -> 1; case "normal" -> 2; default -> 3; };
    }
    private static String nextMessageNo() {
        return "MSG-" + LocalDate.now(ZoneOffset.UTC).toString().replace("-", "")
                + "-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
    }
    private static String now() { return Instant.now().toString(); }
    private String hash(Object value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(objectMapper.writeValueAsBytes(value)));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
    private ApiException invalid(String message) {
        return new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", message, "检查请求字段后重试");
    }
    private ApiException conflict(String message, String suggestion) {
        return new ApiException(409, "PRODUCTION_409_ILLEGAL_STATE", message, suggestion);
    }
    private ApiException versionConflict(VersionConflictDetails details) {
        return new ApiException(409, "PRODUCTION_409_VERSION_CONFLICT", messageVersionConflict(),
                "刷新数据后重新确认操作", List.of(), details);
    }
    private static String messageVersionConflict() { return "数据已被其他操作更新"; }
    private ApiException notFound(String message, String suggestion) {
        return new ApiException(404, "PRODUCTION_404_NOT_FOUND", message, suggestion);
    }
    private record ResolvedMessage(
            String title, String body, String category, String channel,
            String priority, String templateCode
    ) {}

    private record VersionConflictDetails(Integer expectedVersion, Integer actualVersion) {}

    private record IdempotentRequest(String commandType, Object request) {}
}
