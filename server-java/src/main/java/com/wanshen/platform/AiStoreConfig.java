package com.wanshen.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import com.wanshen.platform.ai.AbstractAiStore;
import com.wanshen.platform.ai.AiStore;
import com.wanshen.platform.ai.JdbcAiStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AiStoreConfig {
    @Bean
    public AbstractAiStore aiStore(
            ObjectProvider<javax.sql.DataSource> databaseDataSource, ObjectMapper objectMapper
    ) {
        javax.sql.DataSource dataSource = databaseDataSource.getIfAvailable();
        return dataSource == null ? new AiStore() : new JdbcAiStore(dataSource, objectMapper);
    }
}
