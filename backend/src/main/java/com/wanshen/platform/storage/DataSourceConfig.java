package com.wanshen.platform.storage;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class DataSourceConfig {
    @Bean(destroyMethod = "close")
    @ConditionalOnProperty("DATABASE_URL")
    public HikariDataSource databaseDataSource(
            @Value("${DATABASE_URL}") String databaseUrl,
            @Value("${APP_DB_POOL_SIZE:4}") int poolSize
    ) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(DatabaseUrls.jdbc(databaseUrl));
        config.setPoolName("industrial-ai-java");
        config.setMaximumPoolSize(poolSize);
        config.setMinimumIdle(1);
        return new HikariDataSource(config);
    }
}
