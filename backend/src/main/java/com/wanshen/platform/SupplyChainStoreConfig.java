package com.wanshen.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import com.wanshen.platform.supplychain.AbstractSupplyChainStore;
import com.wanshen.platform.supplychain.JdbcSupplyChainStore;
import com.wanshen.platform.supplychain.SupplyChainStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SupplyChainStoreConfig {
    @Bean
    public AbstractSupplyChainStore supplyChainStore(
            ObjectProvider<javax.sql.DataSource> databaseDataSource, ObjectMapper objectMapper
    ) {
        javax.sql.DataSource dataSource = databaseDataSource.getIfAvailable();
        return dataSource == null ? new SupplyChainStore() : new JdbcSupplyChainStore(dataSource, objectMapper);
    }
}
