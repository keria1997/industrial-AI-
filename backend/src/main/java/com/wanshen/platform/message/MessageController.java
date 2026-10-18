package com.wanshen.platform.message;

import com.wanshen.platform.message.AbstractMessageStore.MessageRecord;
import com.wanshen.platform.message.AbstractMessageStore.Page;
import com.wanshen.platform.message.AbstractMessageStore.Subscription;
import com.wanshen.platform.message.AbstractMessageStore.Template;
import com.wanshen.platform.message.AbstractMessageStore.UserPreference;
import com.wanshen.platform.message.application.MessageApplicationService;
import com.wanshen.platform.message.application.MessageCommands;
import com.wanshen.platform.message.application.MessageCommands.MessageActor;
import com.wanshen.platform.message.application.result.MessageCommandResult;
import com.wanshen.platform.message.application.result.MessageDashboardResponse;
import com.wanshen.platform.message.api.dto.CreateSubscriptionRequest;
import com.wanshen.platform.message.api.dto.CreateTemplateRequest;
import com.wanshen.platform.message.api.dto.MarkAllReadRequest;
import com.wanshen.platform.message.api.dto.SavePreferenceRequest;
import com.wanshen.platform.message.api.dto.SendMessageRequest;
import com.wanshen.platform.message.api.dto.SendBatchMessageRequest;
import com.wanshen.platform.message.api.dto.StarMessageRequest;
import com.wanshen.platform.message.api.dto.UpdateTemplateRequest;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** HTTP adapter for the message center; business rules live in MessageApplicationService. */
@RestController
@RequestMapping("/api/v1/message")
@Validated
@ConditionalOnProperty(value = "app.message.native-enabled", havingValue = "true")
public class MessageController {
    private final MessageApplicationService service;
    private final RequestContextService contexts;

    public MessageController(MessageApplicationService service, RequestContextService contexts) {
        this.service = service;
        this.contexts = contexts;
    }

    @GetMapping("/templates")
    public Page<Template> templates(
            HttpServletRequest request,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String channel,
            @RequestParam(required = false) Boolean isActive,
            @RequestParam(required = false) String search
    ) {
        return service.templates(actor(request), new MessageCommands.TemplateSearch(
                page, pageSize, category, channel, isActive, search
        ));
    }

    @GetMapping("/templates/{id}")
    public Template template(@PathVariable String id, HttpServletRequest request) {
        return service.template(actor(request), id);
    }

    @PostMapping("/templates")
    public ResponseEntity<Template> createTemplate(
            @Valid @RequestBody CreateTemplateRequest input, HttpServletRequest request
    ) {
        return respond(request, service.createTemplate(actor(request), new MessageCommands.CreateTemplate(
                input.code(), input.name(), input.category(), input.channel(), input.titleTemplate(),
                input.bodyTemplate(), variables(input.variables()), input.priority(), input.remark()
        )));
    }

    @PatchMapping("/templates/{id}")
    public ResponseEntity<Template> updateTemplate(
            @PathVariable String id, @Valid @RequestBody UpdateTemplateRequest input,
            HttpServletRequest request
    ) {
        return respond(request, service.updateTemplate(actor(request), new MessageCommands.UpdateTemplate(
                id, input.name(), input.category(), input.channel(), input.titleTemplate(),
                input.bodyTemplate(), variables(input.variables()), input.priority(),
                input.isActive(), input.remark()
        )));
    }

    @DeleteMapping("/templates/{id}")
    public ResponseEntity<Boolean> deleteTemplate(@PathVariable String id, HttpServletRequest request) {
        return respond(request, service.deleteTemplate(actor(request), id));
    }

    @GetMapping("/messages")
    public Page<MessageRecord> messages(
            HttpServletRequest request,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String recipientId,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) Boolean isRead,
            @RequestParam(required = false) Boolean isArchived,
            @RequestParam(required = false) Boolean isStarred,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String search
    ) {
        return service.messages(actor(request), new MessageCommands.MessageSearch(
                page, pageSize, recipientId, category, isRead, isArchived, isStarred, priority, search
        ));
    }

    @GetMapping("/messages/{id}")
    public ResponseEntity<MessageRecord> message(@PathVariable String id, HttpServletRequest request) {
        MessageRecord message = service.message(actor(request), id);
        return ResponseEntity.ok().eTag("\"" + message.version() + "\"").body(message);
    }

    @PostMapping("/messages")
    public ResponseEntity<?> send(@Valid @RequestBody SendMessageRequest input, HttpServletRequest request) {
        return respond(request, service.send(actor(request), new MessageCommands.SendMessage(
                input.templateCode(), input.category(), input.channel(), input.priority(),
                input.recipientId(), input.recipientName(), input.title(), input.body(),
                input.sourceType(), input.sourceId(), input.sourceDocNo(),
                input.metadata(), input.variables()
        )));
    }

    @PostMapping("/messages/batch")
    public ResponseEntity<?> sendBatch(
            @Valid @RequestBody SendBatchMessageRequest input, HttpServletRequest request
    ) {
        return respond(request, service.sendBatch(actor(request), new MessageCommands.SendBatchMessage(
                input.templateCode(), input.category(), input.channel(), input.priority(),
                input.recipientIds(), input.title(), input.body(), input.sourceType(),
                input.sourceId(), input.sourceDocNo(), input.metadata(), input.variables()
        )));
    }

    @PostMapping("/messages/mark-all-read")
    public ResponseEntity<Integer> markAllRead(
            @Valid @RequestBody MarkAllReadRequest input, HttpServletRequest request
    ) {
        return respond(request, service.markAllRead(actor(request), input.recipientId()));
    }

    @PostMapping("/messages/{id}/read")
    public ResponseEntity<MessageRecord> markRead(@PathVariable String id, HttpServletRequest request) {
        return respond(request, service.markRead(actor(request), id));
    }

    @PostMapping("/messages/{id}/archive")
    public ResponseEntity<MessageRecord> archive(@PathVariable String id, HttpServletRequest request) {
        return respond(request, service.archive(actor(request), id));
    }

    @PostMapping("/messages/{id}/star")
    public ResponseEntity<MessageRecord> star(
            @PathVariable String id, @Valid @RequestBody StarMessageRequest input,
            HttpServletRequest request
    ) {
        return respond(request, service.star(actor(request), id, input.starred()));
    }

    @GetMapping("/preferences")
    public List<UserPreference> preferences(@RequestParam String userId, HttpServletRequest request) {
        return service.preferences(actor(request), userId);
    }

    @PutMapping("/preferences")
    public ResponseEntity<UserPreference> updatePreference(
            @Valid @RequestBody SavePreferenceRequest input, HttpServletRequest request
    ) {
        return respond(request, service.savePreference(actor(request), new MessageCommands.SavePreference(
                input.category(), input.channel(), input.enabled(), input.minPriority(),
                input.quietHoursStart(), input.quietHoursEnd()
        )));
    }

    @GetMapping("/subscriptions")
    public List<Subscription> subscriptions(@RequestParam String userId, HttpServletRequest request) {
        return service.subscriptions(actor(request), userId);
    }

    @PostMapping("/subscriptions")
    public ResponseEntity<Subscription> createSubscription(
            @Valid @RequestBody CreateSubscriptionRequest input, HttpServletRequest request
    ) {
        return respond(request, service.createSubscription(actor(request), new MessageCommands.CreateSubscription(
                input.eventType(), input.category(), input.enabled()
        )));
    }

    @DeleteMapping("/subscriptions/{id}")
    public ResponseEntity<Boolean> deleteSubscription(
            @PathVariable String id, HttpServletRequest request
    ) {
        return respond(request, service.deleteSubscription(actor(request), id));
    }

    @GetMapping("/dashboard")
    public MessageDashboardResponse dashboard(
            @RequestParam(required = false) String recipientId, HttpServletRequest request
    ) {
        return service.dashboard(actor(request), recipientId);
    }

    private <T> ResponseEntity<T> respond(HttpServletRequest request, MessageCommandResult<T> result) {
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(result.status())
                .header("X-Trace-Id", contexts.from(request).traceId());
        if (result.replayed()) builder = builder.header("X-Idempotent-Replay", "true");
        if (result.version().isPresent()) builder = builder.eTag("\"" + result.version().get() + "\"");
        return builder.body(result.body());
    }

    private List<MessageCommands.TemplateVariable> variables(List<com.wanshen.platform.message.api.dto.TemplateVariableInput> values) {
        if (values == null) return List.of();
        return values.stream().map(value -> new MessageCommands.TemplateVariable(value.name(), value.desc())).toList();
    }

    private MessageActor actor(HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        return new MessageActor(context.tenantId(), context.actorId(), context.traceId(),
                context.idempotencyKey(), context.expectedVersion(), context.permissions());
    }
}
