package com.wanshen.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import com.wanshen.platform.production.ProductionService;
import com.wanshen.platform.production.ProductionStore;
import com.wanshen.platform.production.JdbcProductionStore;
import com.wanshen.platform.fulfillment.FulfillmentStore;
import com.wanshen.platform.fulfillment.ProductionInventoryAdapter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ProductionStoreConfig {
    @Bean
    public ProductionStore productionStore(
            ObjectProvider<javax.sql.DataSource> databaseDataSource,
            ObjectMapper objectMapper
    ) {
        javax.sql.DataSource dataSource = databaseDataSource.getIfAvailable();
        return dataSource == null ? new ProductionStore() : new JdbcProductionStore(dataSource, objectMapper);
    }

    @Bean
    public ProductionService productionService(ProductionStore store, ObjectMapper objectMapper, FulfillmentStore inventory) {
        ProductionService service = new ProductionService(store, objectMapper);
        service.setInventoryPort(new ProductionInventoryAdapter(inventory, objectMapper));
        return service;
    }
}
