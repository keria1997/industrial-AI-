package com.wanshen.platform.storage;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.production.JdbcProductionStore;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RealJdbcSmokeTests {
    private static final String JDBC_URL = System.getenv("JAVA_JDBC_URL");
    private static final String MIGRATION_JDBC_URL = System.getenv("JAVA_JDBC_MIGRATION_URL");
    private static final String APPLICATION_ROLE = System.getenv("JAVA_JDBC_APP_ROLE");
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void migratesAndExercisesJdbcTransactionsAndTenantIsolation() throws Exception {
        Assumptions.assumeTrue(JDBC_URL != null && !JDBC_URL.isBlank(),
                "Set JAVA_JDBC_URL to run the real PostgreSQL JDBC smoke test");

        migrate();
        rerunMigrationAsNoOp();
        verifySchemaMigrationCount();
        exerciseJsonStoreCommitAndRollback();
        exerciseTenantIsolationAndRollback();
    }

    private void migrate() throws Exception {
        String migrationUrl = MIGRATION_JDBC_URL == null || MIGRATION_JDBC_URL.isBlank()
                ? JDBC_URL : MIGRATION_JDBC_URL;
        try (PostgresDatabaseMigrator migrator = PostgresDatabaseMigrator.open(migrationUrl)) {
            PostgresDatabaseMigrator.MigrationResult result =
                    migrator.migrate(DatabaseMigrationRunner.migrationFiles(), System.out::println);
                assertTrue(result.applied().size() > 0 || result.skipped().size() == expectedMigrationCount());
        }
        if (migrationUrl != JDBC_URL) {
            grantApplicationPrivileges(migrationUrl);
        }
    }

    private void grantApplicationPrivileges(String migrationUrl) throws Exception {
        if (APPLICATION_ROLE == null || APPLICATION_ROLE.isBlank()) {
            throw new IllegalStateException(
                    "JAVA_JDBC_APP_ROLE is required when JAVA_JDBC_MIGRATION_URL is separate");
        }
        String quotedRole = quotedIdentifier(APPLICATION_ROLE);
        try (Connection connection = DriverManager.getConnection(migrationUrl);
             Statement statement = connection.createStatement()) {
            statement.execute("GRANT USAGE ON SCHEMA public TO " + quotedRole);
            statement.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO " + quotedRole);
            statement.execute("GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO " + quotedRole);
            statement.execute("""
                    ALTER DEFAULT PRIVILEGES IN SCHEMA public
                    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %s
                    """.formatted(quotedRole));
            statement.execute("""
                    ALTER DEFAULT PRIVILEGES IN SCHEMA public
                    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %s
                    """.formatted(quotedRole));
        }
    }

    private String quotedIdentifier(String identifier) {
        if (!identifier.matches("[A-Za-z_][A-Za-z0-9_]*")) {
            throw new IllegalArgumentException("Invalid database role identifier: " + identifier);
        }
        return '"' + identifier + '"';
    }

    private void rerunMigrationAsNoOp() throws Exception {
        String migrationUrl = MIGRATION_JDBC_URL == null || MIGRATION_JDBC_URL.isBlank() ? JDBC_URL : MIGRATION_JDBC_URL;
        try (PostgresDatabaseMigrator migrator = PostgresDatabaseMigrator.open(migrationUrl)) {
            PostgresDatabaseMigrator.MigrationResult result =
                    migrator.migrate(DatabaseMigrationRunner.migrationFiles(), ignored -> {});
            assertEquals(expectedMigrationCount(), result.skipped().size());
            assertEquals(0, result.applied().size());
            assertEquals(0, result.baselined().size());
        }
    }

    private void verifySchemaMigrationCount() throws Exception {
        try (Connection connection = DriverManager.getConnection(JDBC_URL);
             PreparedStatement statement = connection.prepareStatement(
                     "SELECT count(*) FROM public.schema_migrations");
             ResultSet resultSet = statement.executeQuery()) {
            assertTrue(resultSet.next());
            assertEquals(expectedMigrationCount(), resultSet.getInt(1));
        }
    }

    private static int expectedMigrationCount() throws Exception {
        return DatabaseMigrationRunner.migrationFiles().size();
    }

    private void exerciseJsonStoreCommitAndRollback() {
        String tenantId = "jdbc-tenant-a";
        String workOrderId = "work-order-1";

        try (HikariDataSource dataSource = testDataSource();
             JdbcProductionStore store = new JdbcProductionStore(dataSource, mapper)) {
            store.transaction(ignored -> {
                store.setMaterialBlocked(tenantId, workOrderId, true);
                return null;
            });
        }

        try (HikariDataSource dataSource = testDataSource();
             JdbcProductionStore store = new JdbcProductionStore(dataSource, mapper)) {
            assertTrue(store.materialBlocked(tenantId, workOrderId));
            RuntimeException rollbackMarker = new RuntimeException("rollback marker");
            assertThrows(RuntimeException.class, () -> store.transaction(ignored -> {
                store.setMaterialBlocked(tenantId, workOrderId, false);
                throw rollbackMarker;
            }));
        }

        try (HikariDataSource dataSource = testDataSource();
             JdbcProductionStore store = new JdbcProductionStore(dataSource, mapper)) {
            assertTrue(store.materialBlocked(tenantId, workOrderId));
        }
    }

    private HikariDataSource testDataSource() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(JDBC_URL);
        config.setMaximumPoolSize(5);
        config.setPoolName("jdbc-smoke-java");
        return new HikariDataSource(config);
    }

    private void exerciseTenantIsolationAndRollback() throws SQLException {
        try (Connection connection = DriverManager.getConnection(JDBC_URL)) {
            connection.setAutoCommit(false);
            bindTenant(connection, "jdbc-tenant-a");
            try (PreparedStatement roleStatement = connection.prepareStatement(
                    "SELECT rolsuper FROM pg_roles WHERE rolname = current_user");
                 ResultSet resultSet = roleStatement.executeQuery()) {
                assertTrue(resultSet.next());
                Assumptions.assumeFalse(resultSet.getBoolean(1),
                        "Use a NOSUPERUSER database role to verify FORCE ROW LEVEL SECURITY");
            }

            execute(connection, """
                    INSERT INTO module_document (module, tenant_id, kind, doc_id, data)
                    VALUES ('jdbc-smoke', 'jdbc-tenant-a', 'Isolation', 'doc-1', '{"ok":true}'::jsonb)
                    ON CONFLICT (module, tenant_id, kind, doc_id) DO UPDATE SET data = EXCLUDED.data
                    """);
            bindTenant(connection, "jdbc-tenant-b");
            assertEquals(0, countCurrentTenantDocument(connection, "doc-1"));
            bindBootstrapMode(connection);
            assertEquals(1, countCurrentTenantDocument(connection, "doc-1"));
            connection.rollback();

            connection.setAutoCommit(false);
            bindTenant(connection, "jdbc-tenant-a");
            execute(connection, """
                    INSERT INTO module_document (module, tenant_id, kind, doc_id, data)
                    VALUES ('jdbc-smoke', 'jdbc-tenant-a', 'Rollback', 'doc-rollback', '{"ok":true}'::jsonb)
                    """);
            connection.rollback();
            connection.setAutoCommit(true);
            bindTenant(connection, "jdbc-tenant-a");
            assertEquals(0, countCurrentTenantDocument(connection, "doc-rollback"));

            execute(connection, "DELETE FROM module_document WHERE module = 'jdbc-smoke'");
        }
    }

    private int countCurrentTenantDocument(Connection connection, String docId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT count(*) FROM module_document WHERE module = 'jdbc-smoke' AND doc_id = ?"
        )) {
            statement.setString(1, docId);
            try (ResultSet resultSet = statement.executeQuery()) {
                assertTrue(resultSet.next());
                return resultSet.getInt(1);
            }
        }
    }

    private void bindTenant(Connection connection, String tenantId) throws SQLException {
        execute(connection, "SELECT set_config('app.tenant_id', ?, false)", tenantId);
    }

    private void bindBootstrapMode(Connection connection) throws SQLException {
        execute(connection, "SELECT set_config('app.bootstrap_mode', 'true', false)");
    }

    private void execute(Connection connection, String sql) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.execute();
        }
    }

    private void execute(Connection connection, String sql, String value) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, value);
            statement.execute();
        }
    }
}
