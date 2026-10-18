package com.wanshen.platform;

import com.wanshen.platform.message.AbstractMessageStore;
import com.wanshen.platform.message.MessageStore;
import com.wanshen.platform.message.infrastructure.persistence.JpaMessageStore;
import com.wanshen.platform.message.infrastructure.persistence.MessageAuditLogJpaRepository;
import com.wanshen.platform.message.infrastructure.persistence.MessageIdempotencyJpaRepository;
import com.wanshen.platform.message.infrastructure.persistence.MessageOutboxJpaRepository;
import com.wanshen.platform.message.infrastructure.persistence.MessagePreferenceJpaRepository;
import com.wanshen.platform.message.infrastructure.persistence.MessageRecordJpaRepository;
import com.wanshen.platform.message.infrastructure.persistence.MessageSubscriptionJpaRepository;
import com.wanshen.platform.message.infrastructure.persistence.MessageTemplateJpaRepository;
import jakarta.persistence.EntityManager;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MessageStoreConfig {
    @Bean
    public TransactionTemplate messageTransactionTemplate(PlatformTransactionManager transactionManager) {
        return new TransactionTemplate(transactionManager);
    }

    @Bean
    public AbstractMessageStore messageStore(
            ObjectProvider<javax.sql.DataSource> databaseDataSource,
            ObjectProvider<MessageTemplateJpaRepository> templateRepositories,
            ObjectProvider<MessageRecordJpaRepository> recordRepositories,
            ObjectProvider<MessagePreferenceJpaRepository> preferenceRepositories,
            ObjectProvider<MessageSubscriptionJpaRepository> subscriptionRepositories,
            ObjectProvider<MessageOutboxJpaRepository> outboxRepositories,
            ObjectProvider<MessageAuditLogJpaRepository> auditRepositories,
            ObjectProvider<MessageIdempotencyJpaRepository> idempotencyRepositories,
            ObjectProvider<TransactionTemplate> transactionTemplates,
            ObjectProvider<EntityManager> entityManagers
    ) {
        javax.sql.DataSource dataSource = databaseDataSource.getIfAvailable();
        boolean repositoriesAvailable = templateRepositories.getIfAvailable() != null
                && recordRepositories.getIfAvailable() != null
                && preferenceRepositories.getIfAvailable() != null
                && subscriptionRepositories.getIfAvailable() != null
                && outboxRepositories.getIfAvailable() != null
                && auditRepositories.getIfAvailable() != null
                && idempotencyRepositories.getIfAvailable() != null;
        if (dataSource != null && repositoriesAvailable) {
            return new JpaMessageStore(
                    templateRepositories.getObject(), recordRepositories.getObject(),
                    preferenceRepositories.getObject(), subscriptionRepositories.getObject(),
                    outboxRepositories.getObject(), auditRepositories.getObject(),
                    idempotencyRepositories.getObject(), transactionTemplates.getObject(),
                    entityManagers.getObject()
            );
        }
        return new MessageStore();
    }
}
