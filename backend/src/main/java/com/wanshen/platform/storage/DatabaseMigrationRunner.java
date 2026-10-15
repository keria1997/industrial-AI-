package com.wanshen.platform.storage;

import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

@Component
public class DatabaseMigrationRunner implements BeanFactoryPostProcessor, EnvironmentAware {
    private Environment environment;
    @Override
    public void setEnvironment(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) {
        boolean migrate = environment.getProperty("app.database.migrate", Boolean.class, false);
        if (!migrate) return;
        String jdbcUrl = DatabaseUrls.jdbc(environment.getProperty("DATABASE_URL", ""));
        if (jdbcUrl.isBlank()) {
            throw new IllegalArgumentException("DATABASE_URL is required for database migration");
        }

        try {
            try (PostgresDatabaseMigrator migrator = PostgresDatabaseMigrator.open(jdbcUrl)) {
                PostgresDatabaseMigrator.MigrationResult result = migrator.migrate(migrationFiles(), System.out::println);
                System.out.printf(
                        "Production migrations complete: %d applied, %d baselined, %d skipped%n",
                        result.applied().size(), result.baselined().size(), result.skipped().size());
            }
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to complete database migrations", exception);
        }
        boolean exitAfterMigration = environment.getProperty("app.migration.exit", Boolean.class, false);
        if (exitAfterMigration) {
            System.exit(0);
        }
    }

    public static List<PostgresDatabaseMigrator.MigrationFile> migrationFiles() throws Exception {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        Resource[] resources = resolver.getResources("classpath*:db/migrations/*.sql");
        return Arrays.stream(resources)
                .sorted(Comparator.comparing(Resource::getFilename, Comparator.nullsLast(String::compareTo)))
                .map(DatabaseMigrationRunner::readMigration)
                .toList();
    }

    private static PostgresDatabaseMigrator.MigrationFile readMigration(Resource resource) {
        try {
            return new PostgresDatabaseMigrator.MigrationFile(
                    resource.getFilename(), resource.getContentAsString(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to read migration resource", exception);
        }
    }
}
