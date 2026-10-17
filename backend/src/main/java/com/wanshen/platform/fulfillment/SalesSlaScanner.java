package com.wanshen.platform.fulfillment;

import com.wanshen.platform.web.RequestContextService.RequestContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/** Hourly sales SLA scan. Notifications and outbox facts are persisted by the aftercare service. */
@Component
public class SalesSlaScanner {
    private static final Logger log = LoggerFactory.getLogger(SalesSlaScanner.class);

    private final FulfillmentStore store;
    private final SalesAftercareService aftercare;

    public SalesSlaScanner(FulfillmentStore store, SalesAftercareService aftercare) {
        this.store = store;
        this.aftercare = aftercare;
    }

    @Scheduled(cron = "${app.sales.sla.scan-cron:0 0 * * * *}")
    public void scanHourly() {
        int created = 0;
        for (String tenantId : store.activeTenantIds()) {
            RequestContext context = new RequestContext(
                    tenantId, "sla-scanner", List.of("sales.order.read"), "sla-" + System.nanoTime(), null, null);
            created += aftercare.scanSla(context);
        }
        if (created > 0) log.info("Sales SLA scan created {} notifications", created);
    }
}
