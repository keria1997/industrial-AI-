package com.wanshen.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import com.wanshen.platform.personnel.AbstractPersonnelStore;
import com.wanshen.platform.personnel.PersonnelStore;
import com.wanshen.platform.personnel.JdbcPersonnelStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class PersonnelStoreConfig {
    @Bean
    public AbstractPersonnelStore personnelStore(
            ObjectProvider<javax.sql.DataSource> databaseDataSource,
            ObjectMapper objectMapper
    ) {
        javax.sql.DataSource dataSource = databaseDataSource.getIfAvailable();
        return dataSource == null ? new PersonnelStore() : new JdbcPersonnelStore(dataSource, objectMapper);
    }
}
