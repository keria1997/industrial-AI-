package com.wanshen.platform.production;

import com.fasterxml.jackson.databind.JsonNode;
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

    private final ProductionStore store;
    private final FulfillmentService fulfillment;
    private final Set<String> configuredTenants;
    private final boolean discoveryEnabled;
    private final int maxAttempts;

    public ProductionFulfillmentOutboxWorker(
            ProductionStore store,
            FulfillmentService fulfillment,
            @Value("${app.production.worker.tenant-ids:}") String tenantIds,
            @Value("${app.production.worker.discovery:true}") boolean discoveryEnabled,
            @Value("${app.production.worker.max-attempts:8}") int maxAttempts
    ) {
        this.store = store;
        this.fulfillment = fulfillment;
        this.configuredTenants = Arrays.stream(tenantIds.split(",")).map(String::trim)
                .filter(value -> !value.isEmpty())
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        this.discoveryEnabled = discoveryEnabled;
        this.maxAttempts = maxAttempts;
    }

    @Scheduled(fixedDelayString = "${app.production.worker.interval-ms:2000}")
    public void run() {
        Set<String> tenants = new LinkedHashSet<>(configuredTenants);
        if (discoveryEnabled) {
            try {
                tenants.addAll(store.pendingOutboxTenantIds(EVENT_TYPE));
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
        List<JsonNode> events = store.pendingOutbox(tenantId, EVENT_TYPE);
        for (JsonNode event : events) {
            JsonNode payload = event.path("payload");
            RequestContext context = new RequestContext(
                    tenantId,
                    "production-outbox-worker",
                    List.of("inventory.availability.sync"),
                    ProductionStore.text(event, "traceId"),
                    null,
                    null
            );
            try {
                fulfillment.receiveCompletion(context, payload);
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
