package com.wanshen.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.fulfillment.FulfillmentService;
import com.wanshen.platform.fulfillment.FulfillmentStore;
import com.wanshen.platform.fulfillment.JdbcFulfillmentStore;
import com.wanshen.platform.production.ProductionStore;
import com.wanshen.platform.production.ProductionService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FulfillmentStoreConfig {
    @Bean
    public FulfillmentStore fulfillmentStore(
            ObjectProvider<javax.sql.DataSource> databaseDataSource,
            ObjectMapper mapper
    ) {
        javax.sql.DataSource dataSource = databaseDataSource.getIfAvailable();
        return dataSource == null ? new FulfillmentStore() : new JdbcFulfillmentStore(dataSource, mapper);
    }

    @Bean
    public FulfillmentService fulfillmentService(
            FulfillmentStore store,
            ProductionStore productionStore,
            ProductionService productionService,
            ObjectMapper mapper,
            @Value("${app.fulfillment.data-key-id:FULFILLMENT_KEY_V1}") String keyId,
            @Value("${app.fulfillment.data-key:}") String encodedKey
    ) {
        String key = encodedKey.isBlank()
                ? "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY"
                : encodedKey;
        FulfillmentService service = new FulfillmentService(store, mapper, keyId, key);
        service.setProductionTaskReader(productionStore::task);
        service.setProductionDemandCreator((context, input) -> {
            String lineKey = "warehouse-demand:" + context.tenantId() + ":"
                    + input.path("payloadSnapshot").path("shipmentRequestLineId").asText()
                    + ":" + input.path("sourceRevision").asInt(1);
            var demandContext = new com.wanshen.platform.web.RequestContextService.RequestContext(
                    context.tenantId(), context.actorId(), context.permissions(), context.traceId(), lineKey, null);
            return productionService.createDemand(demandContext, input).body();
        });
        return service;
    }
}
