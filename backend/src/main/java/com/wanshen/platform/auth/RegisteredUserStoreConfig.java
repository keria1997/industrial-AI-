package com.wanshen.platform.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RegisteredUserStoreConfig {
    @Bean
    public RegisteredUserStore registeredUserStore(
            ObjectProvider<javax.sql.DataSource> databaseDataSource,
            ObjectMapper objectMapper
    ) {
        javax.sql.DataSource dataSource = databaseDataSource.getIfAvailable();
        return dataSource == null
                ? new InMemoryRegisteredUserStore()
                : new JdbcRegisteredUserStore(dataSource, objectMapper);
    }
}
