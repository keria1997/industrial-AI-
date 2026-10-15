package com.wanshen.platform.fulfillment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(value = "app.fulfillment.worker-enabled", havingValue = "true", matchIfMissing = true)
public class FulfillmentOutboxWorker {
    private static final Logger LOG = LoggerFactory.getLogger(FulfillmentOutboxWorker.class);
    private final FulfillmentService service;
    private com.wanshen.platform.WorkerHealth health;
    @org.springframework.beans.factory.annotation.Autowired
    public void setHealth(com.wanshen.platform.WorkerHealth health) { this.health = health; }

    public FulfillmentOutboxWorker(FulfillmentService service) {
        this.service = service;
    }

    @Scheduled(fixedDelayString = "${app.fulfillment.worker.interval-ms:2000}")
    public void runOnce() {
        try {
            service.retryShipmentHandoffs();
            if (health != null) health.success("fulfillment");
        } catch (RuntimeException exception) {
            if (health != null) health.failure("fulfillment", exception);
            LOG.warn("Shipment handoff retry failed", exception);
        }
    }
}
