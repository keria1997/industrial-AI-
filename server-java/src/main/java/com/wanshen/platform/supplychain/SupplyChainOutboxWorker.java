package com.wanshen.platform.supplychain;

import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Component
@ConditionalOnProperty(value = "app.supply-chain.worker-enabled", havingValue = "true")
public class SupplyChainOutboxWorker {
    private final AbstractSupplyChainStore store;
    private final Set<String> configuredTenants;
    private final boolean discoveryEnabled;
    private final int maxAttempts;

    public SupplyChainOutboxWorker(
            AbstractSupplyChainStore store,
            @Value("${app.supply-chain.worker.tenant-ids:}") String tenantIds,
            @Value("${app.supply-chain.worker.discovery:true}") boolean discoveryEnabled,
            @Value("${app.supply-chain.worker.max-attempts:5}") int maxAttempts
    ) {
        this.store = store;
        this.configuredTenants = Arrays.stream(tenantIds.split(",")).map(String::trim)
                .filter(item -> !item.isEmpty())
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        this.discoveryEnabled = discoveryEnabled;
        this.maxAttempts = maxAttempts;
    }

    @Scheduled(fixedDelayString = "${app.supply-chain.worker.interval-ms:2000}")
    public void run() {
        Set<String> tenants = new LinkedHashSet<>(configuredTenants);
        if (discoveryEnabled) {
            try { tenants.addAll(store.pendingOutboxTenantIds()); } catch (RuntimeException ignored) { return; }
        }
        for (String tenant : tenants) {
            try { drain(tenant); } catch (RuntimeException ignored) { }
        }
    }

    public DrainResult drain(String tenantId) {
        int published = 0;
        int failed = 0;
        List<OutboxEvent> events = store.pendingOutbox(tenantId);
        for (OutboxEvent event : events) {
            try {
                store.markOutboxPublished(tenantId, event.eventId());
                published++;
            } catch (RuntimeException exception) {
                store.markOutboxFailed(tenantId, event.eventId(), exception.getMessage(), maxAttempts);
                failed++;
            }
        }
        return new DrainResult(published, failed);
    }

    public record DrainResult(int published, int failed) {}
}
