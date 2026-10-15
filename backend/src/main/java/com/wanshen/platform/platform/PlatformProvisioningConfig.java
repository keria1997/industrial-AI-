package com.wanshen.platform.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class PlatformProvisioningConfig {
    @Bean
    public PlatformProvisioningStore platformProvisioningStore(
            ObjectProvider<javax.sql.DataSource> databaseDataSource, ObjectMapper objectMapper
    ) {
        javax.sql.DataSource dataSource = databaseDataSource.getIfAvailable();
        return dataSource == null
                ? new InMemoryPlatformProvisioningStore()
                : new JdbcPlatformProvisioningStore(dataSource, objectMapper);
    }

    @Bean
    public TenantProvisioningService tenantProvisioningService(PlatformProvisioningStore store) {
        return new TenantProvisioningService(store);
    }

    @Bean
    public PlatformService platformService(PlatformProvisioningStore store) {
        return new PlatformService(store);
    }
}
