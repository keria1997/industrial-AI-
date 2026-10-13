package com.wanshen.platform.message;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.wanshen.platform.message.AbstractMessageStore.MessageRecord;
import com.wanshen.platform.message.AbstractMessageStore.Page;
import com.wanshen.platform.message.AbstractMessageStore.Subscription;
import com.wanshen.platform.message.AbstractMessageStore.Template;
import com.wanshen.platform.message.AbstractMessageStore.TemplateVariable;
import com.wanshen.platform.message.AbstractMessageStore.UserPreference;
import com.wanshen.platform.storage.ModuleInfra.AuditLog;
import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import java.util.function.Supplier;

@RestController
@RequestMapping("/api/v1/message")
@ConditionalOnProperty(value = "app.message.native-enabled", havingValue = "true")
public class MessageController {
    private static final Set<String> CATEGORIES = Set.of(
            "order", "payment", "shipping", "inventory", "production", "procurement", "finance", "system"
    );
    private static final Set<String> CHANNELS = Set.of("in_app", "email", "sms", "webhook");
    private static final Set<String> PRIORITIES = Set.of("urgent", "high", "normal", "low");
    private static final Map<String, Integer> PRIORITY_RANK = Map.of(
            "urgent", 0, "high", 1, "normal", 2, "low", 3
    );

    private final AbstractMessageStore store;
    private final RequestContextService contexts;
    private final ObjectMapper objectMapper;

    public MessageController(
            AbstractMessageStore store,
            RequestContextService contexts,
            ObjectMapper objectMapper
    ) {
        this.store = store;
        this.contexts = contexts;
        this.objectMapper = objectMapper;
    }

    public record TemplateInput(
            String code, String name, String category, String channel,
            String titleTemplate, String bodyTemplate, List<TemplateVariable> variables,
            String priority, String remark
    ) {}

    public record SendMessageInput(
            String templateCode, String category, String channel, String priority,
            String recipientId, String recipientName, String title, String body,
            String sourceType, String sourceId, String sourceDocNo,
            Map<String, Object> metadata, Map<String, String> variables
    ) {}

    public record SendBatchInput(
            String templateCode, String category, String channel, String priority,
            List<String> recipientIds, String title, String body,
            String sourceType, String sourceId, String sourceDocNo,
            Map<String, Object> metadata, Map<String, String> variables
    ) {}

    public record PreferenceInput(
            String category, String channel, Boolean enabled, String minPriority,
            String quietHoursStart, String quietHoursEnd
    ) {}

    public record SubscriptionInput(String eventType, String category, Boolean enabled) {}
    public record MarkAllReadInput(String recipientId) {}
    public record StarInput(boolean starred) {}
    record Command(Object body, int status) {}

    @GetMapping("/templates")
    public Page<Template> templates(
            HttpServletRequest request, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String channel,
            @RequestParam(required = false) Boolean isActive,
            @RequestParam(required = false) String search
    ) {
        RequestContext context = context(request);
        require(context, "message.template.read");
        validatePage(page, pageSize);
        enumValue(category, CATEGORIES, "category");
        enumValue(channel, CHANNELS, "channel");
        return store.templates(context.tenantId(), page, pageSize, category, channel, isActive, search);
    }

    @GetMapping("/templates/{id}")
    public Template template(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "message.template.read");
        validateUuid(id);
        return template(context.tenantId(), id);
    }

    @PostMapping("/templates")
    public ResponseEntity<?> createTemplate(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "message.template.create");
        requireText(input, "code", 100);
        requireText(input, "name", 200);
        requireEnum(input, "category", CATEGORIES);
        requireEnum(input, "channel", CHANNELS);
        requireText(input, "titleTemplate", 500);
        requireText(input, "bodyTemplate", 2000);
        validateVariables(input.path("variables"));
        optionalEnum(input, "priority", PRIORITIES);
        optionalText(input, "remark", 500);
        String code = input.path("code").asText();
        return command(context, "message.template.create", input, () -> {
            if (store.templateByCode(context.tenantId(), code).isPresent()) {
                throw conflict("模板编码已存在", "使用不同的模板编码");
            }
            String timestamp = now();
            String id = UUID.randomUUID().toString();
            Template value = new Template(
                    id, context.tenantId(), code, text(input, "name"),
                    text(input, "category"), text(input, "channel"),
                    text(input, "titleTemplate"), text(input, "bodyTemplate"),
                    variables(input.path("variables")), textOr(input, "priority", "normal"),
                    true, textOrEmpty(input, "remark"), 1, timestamp, timestamp, context.actorId()
            );
            store.saveTemplate(value);
            audit(context, "MessageTemplate", id, 1, "CREATE", null, value);
            outbox(context, "message.template.created.v1", "MessageTemplate", id, 1,
                    Map.of("templateId", id, "code", code));
            return new Command(value, 201);
        });
    }

    @PatchMapping("/templates/{id}")
    public ResponseEntity<?> updateTemplate(
            @PathVariable String id, @RequestBody JsonNode patch, HttpServletRequest request
    ) {
        RequestContext context = context(request);
        require(context, "message.template.update");
        validateUuid(id);
        validatePatch(patch, "name", "category", "channel", "titleTemplate", "bodyTemplate",
                "variables", "priority", "isActive", "remark");
        if (patch.path("variables").isArray()) validateVariables(patch.path("variables"));
        optionalEnum(patch, "category", CATEGORIES);
        optionalEnum(patch, "channel", CHANNELS);
        optionalEnum(patch, "priority", PRIORITIES);
        return command(context, "message.template.update", Map.of("id", id, "patch", patch), () -> {
            Template current = template(context.tenantId(), id);
            requireVersion(context, current.version());
            boolean active = patch.has("isActive") ? patch.get("isActive").asBoolean() : current.isActive();
            JsonNode variables = patch.has("variables") ? patch.get("variables") : null;
            Template updated = new Template(
                    current.id(), current.tenantId(), current.code(),
                    textOrPatch(patch, "name", current.name()),
                    textOrPatch(patch, "category", current.category()),
                    textOrPatch(patch, "channel", current.channel()),
                    textOrPatch(patch, "titleTemplate", current.titleTemplate()),
                    textOrPatch(patch, "bodyTemplate", current.bodyTemplate()),
                    variables == null ? current.variables() : variables(variables),
                    textOrPatch(patch, "priority", current.priority()),
                    active, textOrPatch(patch, "remark", current.remark()),
                    current.version() + 1, current.createdAt(), now(), current.createdBy()
            );
            store.saveTemplate(updated);
            audit(context, "MessageTemplate", id, updated.version(), "UPDATE", current, updated);
            return new Command(updated, 200);
        });
    }

    @DeleteMapping("/templates/{id}")
    public ResponseEntity<?> deleteTemplate(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "message.template.delete");
        validateUuid(id);
        return command(context, "message.template.delete", Map.of("id", id), () -> {
            Template current = template(context.tenantId(), id);
            requireVersion(context, current.version());
            store.deleteTemplate(context.tenantId(), id);
            audit(context, "MessageTemplate", id, current.version(), "DELETE", current, null);
            return new Command(Map.of("deleted", true), 200);
        });
    }

    @GetMapping("/messages")
    public Page<MessageRecord> messages(
            HttpServletRequest request, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String recipientId,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) Boolean isRead,
            @RequestParam(required = false) Boolean isArchived,
            @RequestParam(required = false) Boolean isStarred,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String search
    ) {
        RequestContext context = context(request);
        require(context, "message.read");
        validatePage(page, pageSize);
        enumValue(category, CATEGORIES, "category");
        enumValue(priority, PRIORITIES, "priority");
        return store.records(context.tenantId(), page, pageSize, recipientId, category,
                isRead, isArchived, isStarred, priority, search);
    }

    @GetMapping("/messages/{id}")
    public ResponseEntity<MessageRecord> message(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "message.read");
        validateUuid(id);
        MessageRecord value = record(context.tenantId(), id);
        return ResponseEntity.ok().eTag("\"" + value.version() + "\"").body(value);
    }

    @PostMapping("/messages")
    public ResponseEntity<?> send(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "message.send");
        validateSendMessage(input, false);
        return command(context, "message.send", input, () -> {
            ResolvedMessage resolved = resolveMessage(context, input);
            String recipientId = text(input, "recipientId");
            Optional<UserPreference> preference = store.preference(
                    context.tenantId(), recipientId, resolved.category(), resolved.channel()
            );
            if (preference.isPresent() && !preference.get().enabled()) {
                return new Command(Map.of("skipped", true, "reason", "user_preference_disabled"), 200);
            }
            if (preference.isPresent() && PRIORITY_RANK.get(resolved.priority())
                    > PRIORITY_RANK.get(preference.get().minPriority())) {
                return new Command(Map.of("skipped", true, "reason", "priority_below_threshold"), 200);
            }
            MessageRecord value = messageRecord(context, input, recipientId, resolved);
            store.saveRecord(value);
            audit(context, "MessageRecord", value.id(), 1, "SEND", null, value);
            outbox(context, "message.record.sent.v1", "MessageRecord", value.id(), 1,
                    Map.of("messageId", value.id(), "recipientId", recipientId,
                            "category", resolved.category(), "priority", resolved.priority()));
            return new Command(Map.of("message", value), 201);
        });
    }

    @PostMapping("/messages/batch")
    public ResponseEntity<?> sendBatch(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "message.send");
        validateSendMessage(input, true);
        return command(context, "message.sendBatch", input, () -> {
            ResolvedMessage resolved = resolveMessage(context, input);
            List<MessageRecord> sent = new ArrayList<>();
            for (JsonNode recipient : input.path("recipientIds")) {
                String recipientId = recipient.asText();
                Optional<UserPreference> preference = store.preference(
                        context.tenantId(), recipientId, resolved.category(), resolved.channel()
                );
                if (preference.isPresent() && (!preference.get().enabled()
                        || PRIORITY_RANK.get(resolved.priority()) > PRIORITY_RANK.get(preference.get().minPriority()))) {
                    continue;
                }
                MessageRecord value = messageRecord(context, input, recipientId, resolved);
                store.saveRecord(value);
                outbox(context, "message.record.sent.v1", "MessageRecord", value.id(), 1,
                        Map.of("messageId", value.id(), "recipientId", recipientId,
                                "category", resolved.category(), "priority", resolved.priority()));
                sent.add(value);
            }
            audit(context, "MessageRecord", "batch", 1, "SEND_BATCH", null, Map.of("count", sent.size()));
            return new Command(Map.of("messages", sent, "sent", sent.size(),
                    "skipped", input.path("recipientIds").size() - sent.size()), 201);
        });
    }

    @PostMapping("/messages/mark-all-read")
    public ResponseEntity<?> markAllRead(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "message.read");
        requireText(input, "recipientId", 100);
        String recipientId = text(input, "recipientId");
        return command(context, "message.markAllRead", Map.of("recipientId", recipientId), () -> {
            int count = 0;
            String timestamp = now();
            for (MessageRecord current : store.records(context.tenantId(), 1, 10000,
                    recipientId, null, false, null, null, null, null).items()) {
                MessageRecord updated = new MessageRecord(
                        current.id(), current.tenantId(), current.msgNo(), current.templateCode(),
                        current.category(), current.channel(), current.priority(), current.title(), current.body(),
                        current.recipientId(), current.recipientName(), current.senderId(), current.senderName(),
                        current.sourceType(), current.sourceId(), current.sourceDocNo(), true, timestamp,
                        current.isArchived(), current.archivedAt(), current.isStarred(), current.metadata(),
                        current.status(), current.errorMessage(), current.sentAt(), current.version() + 1,
                        current.createdAt(), timestamp
                );
                store.saveRecord(updated);
                count++;
            }
            audit(context, "MessageRecord", "bulk", 1, "MARK_ALL_READ", null, Map.of("count", count));
            return new Command(Map.of("marked", count), 200);
        });
    }

    @PostMapping("/messages/{id}/read")
    public ResponseEntity<?> markRead(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "message.read");
        validateUuid(id);
        return command(context, "message.markRead", Map.of("id", id), () -> {
            MessageRecord current = record(context.tenantId(), id);
            if (current.isRead()) return new Command(Map.of("message", current), 200);
            requireVersion(context, current.version());
            String timestamp = now();
            MessageRecord updated = record(current, timestamp, timestamp, current.version() + 1, true, timestamp);
            store.saveRecord(updated);
            audit(context, "MessageRecord", id, updated.version(), "MARK_READ", current, updated);
            return new Command(Map.of("message", updated), 200);
        });
    }

    @PostMapping("/messages/{id}/archive")
    public ResponseEntity<?> archive(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "message.read");
        validateUuid(id);
        return command(context, "message.archive", Map.of("id", id), () -> {
            MessageRecord current = record(context.tenantId(), id);
            requireVersion(context, current.version());
            String timestamp = now();
            MessageRecord updated = new MessageRecord(
                    current.id(), current.tenantId(), current.msgNo(), current.templateCode(),
                    current.category(), current.channel(), current.priority(), current.title(), current.body(),
                    current.recipientId(), current.recipientName(), current.senderId(), current.senderName(),
                    current.sourceType(), current.sourceId(), current.sourceDocNo(), current.isRead(), current.readAt(),
                    true, timestamp, current.isStarred(), current.metadata(), current.status(),
                    current.errorMessage(), current.sentAt(), current.version() + 1,
                    current.createdAt(), timestamp
            );
            store.saveRecord(updated);
            audit(context, "MessageRecord", id, updated.version(), "ARCHIVE", current, updated);
            return new Command(Map.of("message", updated), 200);
        });
    }

    @PostMapping("/messages/{id}/star")
    public ResponseEntity<?> star(
            @PathVariable String id, @RequestBody JsonNode input, HttpServletRequest request
    ) {
        RequestContext context = context(request);
        require(context, "message.read");
        validateUuid(id);
        JsonNode starred = input.get("starred");
        if (starred == null || !starred.isBoolean()) invalid("starred 不合法");
        boolean value = starred.asBoolean();
        return command(context, "message.star", Map.of("id", id, "starred", value), () -> {
            MessageRecord current = record(context.tenantId(), id);
            requireVersion(context, current.version());
            String timestamp = now();
            MessageRecord updated = new MessageRecord(
                    current.id(), current.tenantId(), current.msgNo(), current.templateCode(),
                    current.category(), current.channel(), current.priority(), current.title(), current.body(),
                    current.recipientId(), current.recipientName(), current.senderId(), current.senderName(),
                    current.sourceType(), current.sourceId(), current.sourceDocNo(), current.isRead(), current.readAt(),
                    current.isArchived(), current.archivedAt(), value, current.metadata(), current.status(),
                    current.errorMessage(), current.sentAt(), current.version() + 1,
                    current.createdAt(), timestamp
            );
            store.saveRecord(updated);
            audit(context, "MessageRecord", id, updated.version(), value ? "STAR" : "UNSTAR", current, updated);
            return new Command(Map.of("message", updated), 200);
        });
    }

    @GetMapping("/preferences")
    public List<UserPreference> preferences(
            @RequestParam String userId, HttpServletRequest request
    ) {
        RequestContext context = context(request);
        require(context, "message.preference.read");
        requireQueryValue("userId", userId, 100);
        return store.preferences(context.tenantId(), userId);
    }

    @PutMapping("/preferences")
    public ResponseEntity<?> updatePreference(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "message.preference.update");
        requireEnum(input, "category", CATEGORIES);
        requireEnum(input, "channel", CHANNELS);
        optionalBoolean(input, "enabled");
        optionalEnum(input, "minPriority", PRIORITIES);
        optionalText(input, "quietHoursStart", 10);
        optionalText(input, "quietHoursEnd", 10);
        return command(context, "message.preference.update", input, () -> {
            Optional<UserPreference> current = store.preference(context.tenantId(), context.actorId(),
                    text(input, "category"), text(input, "channel"));
            String timestamp = now();
            if (current.isPresent()) {
                requireVersion(context, current.get().version());
                UserPreference updated = new UserPreference(
                        current.get().id(), current.get().tenantId(), current.get().userId(),
                        current.get().category(), current.get().channel(),
                        input.has("enabled") ? input.get("enabled").asBoolean() : current.get().enabled(),
                        textOrPatch(input, "minPriority", current.get().minPriority()),
                        textOrPatch(input, "quietHoursStart", current.get().quietHoursStart()),
                        textOrPatch(input, "quietHoursEnd", current.get().quietHoursEnd()),
                        current.get().version() + 1, current.get().createdAt(), timestamp
                );
                store.savePreference(updated);
                audit(context, "UserPreference", updated.id(), updated.version(), "UPDATE",
                        current.get(), updated);
                return new Command(Map.of("preference", updated), 200);
            }
            String id = UUID.randomUUID().toString();
            UserPreference created = new UserPreference(
                    id, context.tenantId(), context.actorId(), text(input, "category"),
                    text(input, "channel"), input.path("enabled").asBoolean(true),
                    textOr(input, "minPriority", "low"), textOrEmpty(input, "quietHoursStart"),
                    textOrEmpty(input, "quietHoursEnd"), 1, timestamp, timestamp
            );
            store.savePreference(created);
            audit(context, "UserPreference", id, 1, "CREATE", null, created);
            return new Command(Map.of("preference", created), 201);
        });
    }

    @GetMapping("/subscriptions")
    public List<Subscription> subscriptions(
            @RequestParam String userId, HttpServletRequest request
    ) {
        RequestContext context = context(request);
        require(context, "message.subscription.read");
        requireQueryValue("userId", userId, 100);
        return store.subscriptions(context.tenantId(), userId);
    }

    @PostMapping("/subscriptions")
    public ResponseEntity<?> createSubscription(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "message.subscription.create");
        requireText(input, "eventType", 200);
        requireEnum(input, "category", CATEGORIES);
        optionalBoolean(input, "enabled");
        String eventType = text(input, "eventType");
        return command(context, "message.subscription.create", input, () -> {
            if (store.subscription(context.tenantId(), context.actorId(), eventType).isPresent()) {
                throw conflict("已订阅该事件类型", "取消已有订阅后重试");
            }
            String timestamp = now();
            String id = UUID.randomUUID().toString();
            Subscription value = new Subscription(
                    id, context.tenantId(), context.actorId(), eventType, text(input, "category"),
                    input.path("enabled").asBoolean(true), 1, timestamp, timestamp
            );
            store.saveSubscription(value);
            audit(context, "Subscription", id, 1, "CREATE", null, value);
            return new Command(Map.of("subscription", value), 201);
        });
    }

    @DeleteMapping("/subscriptions/{id}")
    public ResponseEntity<?> deleteSubscription(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "message.subscription.delete");
        validateUuid(id);
        return command(context, "message.subscription.delete", Map.of("id", id), () -> {
            Subscription current = store.subscriptions(context.tenantId(), context.actorId()).stream()
                    .filter(item -> item.id().equals(id)).findFirst()
                    .orElseThrow(() -> notFound("订阅不存在", "刷新订阅列表后重试"));
            requireVersion(context, current.version());
            store.deleteSubscription(context.tenantId(), id);
            audit(context, "Subscription", id, current.version(), "DELETE", current, null);
            return new Command(Map.of("deleted", true), 200);
        });
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(
            @RequestParam(required = false) String recipientId, HttpServletRequest request
    ) {
        RequestContext context = context(request);
        require(context, "message.read");
        if (recipientId != null && recipientId.length() > 100) invalid("recipientId 不合法");
        Page<MessageRecord> page = store.records(context.tenantId(), 1, 1000,
                recipientId, null, null, null, null, null, null);
        List<MessageRecord> unread = page.items().stream().filter(item -> !item.isRead()).toList();
        Map<String, Long> byCategory = new LinkedHashMap<>();
        Map<String, Long> byPriority = new LinkedHashMap<>();
        for (MessageRecord item : page.items()) {
            byCategory.merge(item.category(), 1L, Long::sum);
            byPriority.merge(item.priority(), 1L, Long::sum);
        }
        return Map.of(
                "total", page.total(),
                "unread", unread.size(),
                "archived", page.items().stream().filter(MessageRecord::isArchived).count(),
                "starred", page.items().stream().filter(MessageRecord::isStarred).count(),
                "byCategory", byCategory,
                "byPriority", byPriority,
                "recentUnread", unread.stream().limit(10).toList()
        );
    }

    private record ResolvedMessage(
            String title, String body, String category, String channel,
            String priority, String templateCode
    ) {}

    private ResolvedMessage resolveMessage(RequestContext context, JsonNode input) {
        String title = text(input, "title");
        String body = text(input, "body");
        String category = text(input, "category");
        String channel = textOr(input, "channel", "in_app");
        String priority = textOr(input, "priority", "normal");
        String templateCode = null;
        if (input.hasNonNull("templateCode")) {
            Template template = store.templateByCode(context.tenantId(), input.get("templateCode").asText())
                    .orElseThrow(() -> notFound("消息模板不存在", "确认模板编码后重试"));
            if (!template.isActive()) throw conflict("消息模板已停用", "启用模板后重试");
            Map<String, String> vars = new LinkedHashMap<>();
            input.path("variables").fields().forEachRemaining(entry -> vars.put(entry.getKey(), entry.getValue().asText()));
            title = render(template.titleTemplate(), vars);
            body = render(template.bodyTemplate(), vars);
            category = template.category();
            channel = template.channel();
            priority = template.priority();
            templateCode = template.code();
        }
        return new ResolvedMessage(title, body, category, channel, priority, templateCode);
    }

    private MessageRecord messageRecord(
            RequestContext context, JsonNode input, String recipientId, ResolvedMessage resolved
    ) {
        String timestamp = now();
        String id = UUID.randomUUID().toString();
        return new MessageRecord(
                id, context.tenantId(), msgNo(), resolved.templateCode(),
                resolved.category(), resolved.channel(), resolved.priority(), resolved.title(), resolved.body(),
                recipientId, textOrEmpty(input, "recipientName"), context.actorId(),
                "system".equals(context.actorId()) ? "系统" : context.actorId(),
                textOrEmpty(input, "sourceType"), textOrEmpty(input, "sourceId"),
                textOrEmpty(input, "sourceDocNo"), false, null, false, null, false,
                input.has("metadata") && input.get("metadata").isObject()
                        ? objectMapper.convertValue(input.get("metadata"), new TypeReference<Map<String, Object>>() {}) : Map.of(),
                "sent", "", timestamp, 1, timestamp, timestamp
    );
    }

    private ResponseEntity<?> command(
            RequestContext context, String type, Object input, Supplier<Command> work
    ) {
        if (context.idempotencyKey() == null || context.idempotencyKey().isBlank()) {
            throw new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", "写操作缺少幂等键", "提供 X-Idempotency-Key 后重试");
        }
        String hash = hash(input);
        return store.transaction(() -> {
            Optional<com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord> replay =
                    store.idempotency(context.tenantId(), type, context.idempotencyKey());
            if (replay.isPresent()) {
                if (!replay.get().requestHash().equals(hash)) {
                    throw conflict("幂等键已用于不同请求", "为新业务操作使用新的幂等键");
                }
                return replayResponse(context, replay.get().statusCode(), replay.get().body());
            }
            Command result = work.get();
            store.saveIdempotency(context.tenantId(), type, context.idempotencyKey(), hash,
                    result.status(), result.body());
            return response(result.status(), result.body(), context.traceId(), false);
        });
    }

    @SuppressWarnings("unchecked")
    private ResponseEntity<?> replayResponse(RequestContext context, int status, Object body) {
        Integer version = versionFromBody(body);
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(status)
                .header("X-Trace-Id", context.traceId())
                .header("X-Idempotent-Replay", "true");
        if (version != null) builder = builder.eTag("\"" + version + "\"");
        return builder.body(body);
    }

    @SuppressWarnings("unchecked")
    private ResponseEntity<?> response(int status, Object body, String traceId, boolean replayed) {
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(status)
                .header("X-Trace-Id", traceId);
        if (replayed) builder = builder.header("X-Idempotent-Replay", "true");
        Integer version = versionFromBody(body);
        if (version != null) builder = builder.eTag("\"" + version + "\"");
        return builder.body(body);
    }

    private Integer versionFromBody(Object body) {
        if (body instanceof MessageRecord record) return record.version();
        if (body instanceof Template template) return template.version();
        if (body instanceof UserPreference preference) return preference.version();
        if (body instanceof Subscription subscription) return subscription.version();
        if (!(body instanceof Map<?, ?> map)) return null;
        Object value = map.containsKey("message") ? map.get("message")
                : map.containsKey("template") ? map.get("template")
                : map.containsKey("preference") ? map.get("preference")
                : map.containsKey("subscription") ? map.get("subscription") : body;
        if (value instanceof MessageRecord record) return record.version();
        if (value instanceof Template template) return template.version();
        if (value instanceof UserPreference preference) return preference.version();
        if (value instanceof Subscription subscription) return subscription.version();
        return null;
    }

    private void audit(
            RequestContext context, String aggregateType, String aggregateId,
            int version, String action, Object before, Object after
    ) {
        store.addAuditLog(new AuditLog(
                UUID.randomUUID().toString(), context.tenantId(), aggregateType, aggregateId,
                version, action, context.actorId(), before, after, UUID.randomUUID().toString(),
                context.traceId(), now()
        ));
    }

    private void outbox(
            RequestContext context, String eventType, String aggregateType, String aggregateId,
            int aggregateVersion, Map<String, Object> payload
    ) {
        store.addOutbox(new OutboxEvent(
                UUID.randomUUID().toString(), context.tenantId(), eventType, aggregateType,
                aggregateId, aggregateVersion, UUID.randomUUID().toString(), context.traceId(),
                payload, "PENDING", 0, "", now()
        ));
    }

    private void require(RequestContext context, String permission) {
        if (!context.has(permission)) {
            throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED",
                    "缺少操作权限：" + permission, "请联系管理员授予对应消息权限");
        }
    }

    private void requireVersion(RequestContext context, int actual) {
        if (context.expectedVersion() == null) {
            throw versionConflict("缺少聚合版本", Map.of("actualVersion", actual));
        }
        if (context.expectedVersion() != actual) {
            throw versionConflict("数据已被其他操作更新", Map.of(
                    "expectedVersion", context.expectedVersion(), "actualVersion", actual
            ));
        }
    }

    private void validateSendMessage(JsonNode input, boolean batch) {
        optionalText(input, "templateCode", 100);
        requireEnum(input, "category", CATEGORIES);
        optionalEnum(input, "channel", CHANNELS);
        optionalEnum(input, "priority", PRIORITIES);
        if (batch) {
            JsonNode recipients = input.get("recipientIds");
            if (!recipients.isArray() || recipients.isEmpty() || recipients.size() > 500) {
                invalid("recipientIds 不合法");
            }
            for (JsonNode recipient : recipients) {
                if (!recipient.isTextual() || recipient.asText().isBlank()
                        || recipient.asText().length() > 100) invalid("recipientIds 不合法");
            }
        } else {
            requireText(input, "recipientId", 100);
        }
        optionalText(input, "recipientName", 200);
        requireText(input, "title", 500);
        requireText(input, "body", 2000);
        optionalText(input, "sourceType", 100);
        optionalText(input, "sourceId", 100);
        optionalText(input, "sourceDocNo", 100);
        if (input.has("metadata") && !input.get("metadata").isObject()) invalid("metadata 不合法");
        if (input.has("variables") && !input.get("variables").isObject()) invalid("variables 不合法");
    }

    private void validateVariables(JsonNode value) {
        if (value.isMissingNode() || value.isNull()) return;
        if (!value.isArray()) invalid("variables 不合法");
        for (JsonNode item : value) {
            if (!item.isObject() || !item.has("name")) invalid("variables 不合法");
            requireRange(item.get("name").asText(), 1, 50);
            if (item.hasNonNull("desc") && item.get("desc").asText().length() > 200) {
                invalid("variables 不合法");
            }
        }
    }

    private void validatePatch(JsonNode patch, String... fields) {
        if (!patch.isObject() || patch.isEmpty()) invalid("至少提供一个更新字段");
        Set<String> allowed = Set.of(fields);
        patch.fieldNames().forEachRemaining(field -> {
            if (!allowed.contains(field)) invalid(field + " 不合法");
        });
        if (patch.has("name")) requireRange(patch.get("name").asText(), 1, 200);
        if (patch.has("titleTemplate")) requireRange(patch.get("titleTemplate").asText(), 1, 500);
        if (patch.has("bodyTemplate")) requireRange(patch.get("bodyTemplate").asText(), 1, 2000);
        if (patch.has("isActive") && !patch.get("isActive").isBoolean()) invalid("isActive 不合法");
        if (patch.has("remark") && patch.get("remark").asText().length() > 500) invalid("remark 不合法");
    }

    private void validatePage(Integer page, Integer pageSize) {
        if (page != null && page < 1) invalid("页码必须大于等于 1");
        if (pageSize != null && (pageSize < 1 || pageSize > 200)) invalid("每页数量必须在 1-200 之间");
    }

    private void requireEnum(JsonNode input, String field, Set<String> values) {
        if (!input.hasNonNull(field) || !values.contains(input.get(field).asText())) invalid(field + " 不合法");
    }

    private void optionalEnum(JsonNode input, String field, Set<String> values) {
        if (input.hasNonNull(field) && !values.contains(input.get(field).asText())) invalid(field + " 不合法");
    }

    private void requireText(JsonNode input, String field, int maxLength) {
        if (!input.hasNonNull(field)) invalid(field + " 不合法");
        requireRange(input.get(field).asText(), 1, maxLength);
    }

    private void optionalText(JsonNode input, String field, int maxLength) {
        if (input.hasNonNull(field) && input.get(field).asText().length() > maxLength) invalid(field + " 不合法");
    }

    private void optionalBoolean(JsonNode input, String field) {
        if (input.has(field) && !input.get(field).isBoolean()) invalid(field + " 不合法");
    }

    private void requireRange(String value, int minLength, int maxLength) {
        if (value == null || value.length() < minLength || value.length() > maxLength) {
            invalid("请求字段不符合规则");
        }
    }

    private void requireQueryValue(String field, String value, int maxLength) {
        if (value == null || value.isBlank() || value.length() > maxLength) invalid(field + " 不合法");
    }

    private void enumValue(String value, Set<String> values, String field) {
        if (value != null && !values.contains(value)) invalid(field + " 不合法");
    }

    private List<TemplateVariable> variables(JsonNode value) {
        if (value == null || value.isNull() || value.isMissingNode()) return List.of();
        List<TemplateVariable> result = new ArrayList<>();
        value.forEach(item -> result.add(new TemplateVariable(
                item.get("name").asText(), item.hasNonNull("desc") ? item.get("desc").asText() : null
        )));
        return result;
    }
    private String render(String template, Map<String, String> variables) {
        return java.util.regex.Pattern.compile("\\{\\{(\\w+)\\}\\}")
                .matcher(template)
                .replaceAll(match -> variables.getOrDefault(match.group(1), ""));
    }
    private String msgNo() {
        return "MSG-" + LocalDate.now(ZoneOffset.UTC).toString().replace("-", "")
                + "-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
    }
    private String now() { return Instant.now().toString(); }
    private String hash(Object value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(objectMapper.writeValueAsBytes(value)));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
    private String text(JsonNode input, String field) { return input.get(field).asText(); }
    private String textOr(JsonNode input, String field, String fallback) {
        return input.hasNonNull(field) ? input.get(field).asText() : fallback;
    }
    private String textOrEmpty(JsonNode input, String field) { return textOr(input, field, ""); }
    private String textOrPatch(JsonNode input, String field, String fallback) {
        return input.has(field) ? input.get(field).asText() : fallback;
    }
    private Template template(String tenantId, String id) {
        return store.template(tenantId, id).orElseThrow(() -> notFound("消息模板不存在", "刷新模板列表后重试"));
    }
    private MessageRecord record(String tenantId, String id) {
        return store.record(tenantId, id).orElseThrow(() -> notFound("消息不存在", "刷新消息列表后重试"));
    }
    private MessageRecord record(MessageRecord current, String readAt, String updatedAt, int version, boolean read, String ignored) {
        return new MessageRecord(
                current.id(), current.tenantId(), current.msgNo(), current.templateCode(),
                current.category(), current.channel(), current.priority(), current.title(), current.body(),
                current.recipientId(), current.recipientName(), current.senderId(), current.senderName(),
                current.sourceType(), current.sourceId(), current.sourceDocNo(), read, readAt,
                current.isArchived(), current.archivedAt(), current.isStarred(), current.metadata(),
                current.status(), current.errorMessage(), current.sentAt(), version,
                current.createdAt(), updatedAt
        );
    }
    private RequestContext context(HttpServletRequest request) { return contexts.from(request); }
    private void validateUuid(String value) {
        try { UUID.fromString(value); } catch (RuntimeException exception) {
            invalid("ID 必须是 UUID");
        }
    }
    private void invalid(String message) {
        throw new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", message, "检查请求字段后重试");
    }
    private ApiException conflict(String message, String suggestion) {
        return new ApiException(409, "PRODUCTION_409_ILLEGAL_STATE", message, suggestion);
    }
    private ApiException versionConflict(String message, Map<String, Object> details) {
        return new ApiException(409, "PRODUCTION_409_VERSION_CONFLICT", message,
                "刷新数据后重新确认操作", List.of(), details);
    }
    private ApiException notFound(String message, String suggestion) {
        return new ApiException(404, "PRODUCTION_404_NOT_FOUND", message, suggestion);
    }
}
