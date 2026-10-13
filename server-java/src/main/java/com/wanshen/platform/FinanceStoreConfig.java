package com.wanshen.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import com.wanshen.platform.finance.AbstractFinanceStore;
import com.wanshen.platform.finance.FinanceStore;
import com.wanshen.platform.finance.JdbcFinanceStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FinanceStoreConfig {
    @Bean
    public AbstractFinanceStore financeStore(
            ObjectProvider<javax.sql.DataSource> databaseDataSource,
            ObjectMapper objectMapper
    ) {
        javax.sql.DataSource dataSource = databaseDataSource.getIfAvailable();
        return dataSource == null ? new FinanceStore() : new JdbcFinanceStore(dataSource, objectMapper);
    }
}
