package com.wanshen.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import com.wanshen.platform.message.AbstractMessageStore;
import com.wanshen.platform.message.JdbcMessageStore;
import com.wanshen.platform.message.MessageStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MessageStoreConfig {
    @Bean
    public AbstractMessageStore messageStore(
            ObjectProvider<javax.sql.DataSource> databaseDataSource,
            ObjectMapper objectMapper
    ) {
        javax.sql.DataSource dataSource = databaseDataSource.getIfAvailable();
        return dataSource == null ? new MessageStore() : new JdbcMessageStore(dataSource, objectMapper);
    }
}
