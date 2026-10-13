package com.wanshen.platform.production;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.springframework.beans.factory.annotation.Autowired;
import com.wanshen.platform.fulfillment.FulfillmentService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Component
@ConditionalOnProperty(value = "app.production.worker-enabled", havingValue = "true")
public class ProductionFulfillmentOutboxWorker {
    private static final String EVENT_TYPE = "production.completion.posted.v1";
    private static final String REQUEST_TYPE = "production.completion.requested.v1";

    private final ProductionStore store;
    private final FulfillmentService fulfillment;
    private final ProductionService production;
    private final Set<String> configuredTenants;
    private final boolean discoveryEnabled;
    private final int maxAttempts;

    @Autowired
    public ProductionFulfillmentOutboxWorker(
            ProductionStore store,
            FulfillmentService fulfillment,
            ProductionService production,
            @Value("${app.production.worker.tenant-ids:}") String tenantIds,
            @Value("${app.production.worker.discovery:true}") boolean discoveryEnabled,
            @Value("${app.production.worker.max-attempts:8}") int maxAttempts
    ) {
        this.store = store;
        this.fulfillment = fulfillment;
        this.production = production;
        this.configuredTenants = Arrays.stream(tenantIds.split(",")).map(String::trim)
                .filter(value -> !value.isEmpty())
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        this.discoveryEnabled = discoveryEnabled;
        this.maxAttempts = maxAttempts;
    }

    public ProductionFulfillmentOutboxWorker(ProductionStore store, FulfillmentService fulfillment,
                                             String tenantIds, boolean discoveryEnabled, int maxAttempts) {
        this(store, fulfillment, new ProductionService(store, new com.fasterxml.jackson.databind.ObjectMapper()),
                tenantIds, discoveryEnabled, maxAttempts);
    }

    @Scheduled(fixedDelayString = "${app.production.worker.interval-ms:2000}")
    public void run() {
        Set<String> tenants = new LinkedHashSet<>(configuredTenants);
        if (discoveryEnabled) {
            try {
                tenants.addAll(store.pendingOutboxTenantIds(EVENT_TYPE));
                tenants.addAll(store.pendingOutboxTenantIds(REQUEST_TYPE));
            } catch (RuntimeException ignored) {
                return;
            }
        }
        tenants.forEach(tenantId -> {
            try {
                drain(tenantId);
            } catch (RuntimeException ignored) {
            }
        });
    }

    public DrainResult drain(String tenantId) {
        int published = 0;
        int failed = 0;
        List<JsonNode> events = new java.util.ArrayList<>(store.pendingOutbox(tenantId, REQUEST_TYPE));
        events.addAll(store.pendingOutbox(tenantId, EVENT_TYPE));
        for (JsonNode event : events) {
            ObjectNode payload = event.path("payload").deepCopy();
            payload.put("eventId", ProductionStore.text(event, "eventId"))
                    .put("correlationId", ProductionStore.text(event, "correlationId"))
                    .put("occurredAt", ProductionStore.text(event, "createdAt"));
            RequestContext context = new RequestContext(
                    tenantId,
                    "production-outbox-worker",
                    List.of("inventory.availability.sync", "production.inventory.callback"),
                    ProductionStore.text(event, "traceId"),
                    "inventory-worker:" + ProductionStore.text(event, "eventId"),
                    null
            );
            try {
                fulfillment.receiveCompletion(context, payload);
                if (REQUEST_TYPE.equals(ProductionStore.text(event, "eventType"))) {
                    ObjectNode result = JsonNodeFactory.instance.objectNode().put("result", "POSTED")
                            .put("externalTransactionId", ProductionStore.text(payload, "externalTransactionId"));
                    production.inventoryResult(context, ProductionStore.text(payload, "completionId"), result);
                }
                store.markOutboxPublished(tenantId, ProductionStore.text(event, "eventId"));
                published++;
            } catch (RuntimeException exception) {
                store.markOutboxFailed(tenantId, ProductionStore.text(event, "eventId"),
                        exception.getMessage(), maxAttempts);
                failed++;
            }
        }
        return new DrainResult(published, failed);
    }

    public record DrainResult(int published, int failed) {}
}
