package com.wanshen.platform.storage;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.regex.Pattern;

public final class PostgresDatabaseMigrator implements AutoCloseable {
    public static final int MIGRATION_ADVISORY_LOCK_ID = 721834501;
    private static final Pattern EXPLICIT_TRANSACTION =
            Pattern.compile("^\\s*(BEGIN|START\\s+TRANSACTION)\\b");

    private final Connection connection;

    private PostgresDatabaseMigrator(Connection connection) {
        this.connection = connection;
    }

    public static PostgresDatabaseMigrator open(String jdbcUrl) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(jdbcUrl);
        config.setMaximumPoolSize(1);
        config.setPoolName("database-migration-java");
        try {
            return new PostgresDatabaseMigrator(new HikariDataSource(config).getConnection());
        } catch (SQLException exception) {
            throw new IllegalStateException("Unable to open migration connection", exception);
        }
    }

    public MigrationResult migrate(List<MigrationFile> files, Consumer<String> log) {
        List<MigrationFile> migrationFiles = List.copyOf(files);
        MigrationResult result = new MigrationResult();
        Map<String, AppliedMigration> applied = new HashMap<>();
        try {
            bindMigrationContext();
            execute("SELECT pg_advisory_lock(?)", statement ->
                    statement.setLong(1, MIGRATION_ADVISORY_LOCK_ID));
            execute("""
                    CREATE TABLE IF NOT EXISTS public.schema_migrations (
                      filename VARCHAR(255) PRIMARY KEY,
                      checksum VARCHAR(64) NOT NULL,
                      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )
                    """, statement -> {});
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT filename, checksum FROM public.schema_migrations ORDER BY filename");
                 ResultSet resultSet = statement.executeQuery()) {
                while (resultSet.next()) {
                    applied.put(resultSet.getString(1), new AppliedMigration(resultSet.getString(2)));
                }
            }

            for (MigrationFile file : migrationFiles) {
                String checksum = migrationChecksum(file.sql());
                AppliedMigration existing = applied.get(file.filename());
                if (existing != null) {
                    if (!existing.checksum().equals(checksum)) {
                        throw new IllegalStateException(
                                "Applied migration checksum changed for " + file.filename());
                    }
                    result.addSkipped(file.filename());
                    log.accept("Skipped migration " + file.filename());
                    continue;
                }

                String sentinel = legacyFileSentinels().get(file.filename());
                if (sentinel != null && hasLegacyObject(sentinel)) {
                    recordMigration(file, checksum);
                    result.addBaselined(file.filename());
                    log.accept("Baselined migration " + file.filename());
                    continue;
                }

                applyMigration(file);
                recordMigration(file, checksum);
                result.addApplied(file.filename());
                log.accept("Applied migration " + file.filename());
            }
            return result;
        } catch (SQLException exception) {
            throw new IllegalStateException("Database migration failed", exception);
        } finally {
            clearMigrationContext();
            try {
                execute("SELECT pg_advisory_unlock(?)", statement ->
                        statement.setLong(1, MIGRATION_ADVISORY_LOCK_ID));
            } catch (SQLException exception) {
                log.accept("Unable to release migration advisory lock: " + exception.getMessage());
            }
        }
    }

    private void bindMigrationContext() throws SQLException {
        execute("SELECT set_config('app.tenant_id', 'default', false)", statement -> {});
        execute("SELECT set_config('app.current_tenant_id', 'default', false)", statement -> {});
        execute("SELECT set_config('app.bootstrap_mode', 'true', false)", statement -> {});
    }

    private void clearMigrationContext() {
        try {
            execute("SELECT set_config('app.tenant_id', '', false)", statement -> {});
            execute("SELECT set_config('app.current_tenant_id', '', false)", statement -> {});
            execute("SELECT set_config('app.bootstrap_mode', 'false', false)", statement -> {});
        } catch (SQLException exception) {
            throw new IllegalStateException("Unable to clear migration context", exception);
        }
    }

    public static List<Map.Entry<String, String>> legacyFileSentinelEntries() {
        return List.copyOf(legacyFileSentinels().entrySet());
    }

    private static Map<String, String> legacyFileSentinels() {
        Map<String, String> sentinels = new HashMap<>();
        sentinels.put("001_production_p0.sql", "public.prod_bom");
        sentinels.put("002_sales_production_link.sql", "public.prod_inventory_availability");
        sentinels.put("003_shared_fulfillment_infrastructure.sql", "public.fulfill_idempotency_record");
        sentinels.put("004_sales_fulfillment.sql", "public.sales_order");
        sentinels.put("005_inventory_fulfillment.sql", "public.inv_availability_projection");
        sentinels.put("006_production_fulfillment_link.sql", "public.prod_event_outbox.error_message");
        sentinels.put("007_procurement_material_fulfillment.sql", "public.proc_purchase_request");
        sentinels.put("008_platform_iam.sql", "public.iam_tenant");
        sentinels.put("009_finance_settlement.sql", "public.fin_receivable");
        sentinels.put("010_procurement_completion.sql", "public.proc_supplier");
        sentinels.put("011_inventory_completion.sql", "public.inv_warehouse");
        sentinels.put("012_message_center.sql", "public.msg_template");
        sentinels.put("013_ai_intelligence.sql", "public.ai_model_config");
        sentinels.put("014_personnel_supply_chain.sql", "public.hr_employee");
        sentinels.put("015_auth_users.sql", "public.registered_users");
        sentinels.put("016_tenant_employee_accounts.sql", "public.registered_users.is_tenant_admin");
        sentinels.put("017_module_business_persistence.sql", "public.module_document");
        return Map.copyOf(sentinels);
    }

    private void applyMigration(MigrationFile file) throws SQLException {
        boolean explicitTransaction = EXPLICIT_TRANSACTION.matcher(file.sql()).find();
        if (!explicitTransaction) {
            connection.setAutoCommit(false);
        }
        try {
            try (Statement statement = connection.createStatement()) {
                statement.execute(file.sql());
            }
            if (!explicitTransaction) {
                connection.commit();
            }
        } catch (SQLException exception) {
            rollbackCurrentTransaction(explicitTransaction);
            throw exception;
        } finally {
            connection.setAutoCommit(true);
        }
    }

    private void rollbackCurrentTransaction(boolean explicitTransaction) {
        try {
            if (explicitTransaction) {
                try (Statement statement = connection.createStatement()) {
                    statement.execute("ROLLBACK");
                }
            } else {
                connection.rollback();
            }
        } catch (SQLException ignored) {
            // Preserve the original migration failure.
        }
    }

    private void recordMigration(MigrationFile file, String checksum) throws SQLException {
        execute("""
                INSERT INTO public.schema_migrations (filename, checksum)
                VALUES (?, ?)
                ON CONFLICT (filename) DO NOTHING
                """, statement -> {
            statement.setString(1, file.filename());
            statement.setString(2, checksum);
        });
    }

    private boolean hasLegacyObject(String qualifiedObject) throws SQLException {
        String[] parts = qualifiedObject.split("\\.");
        boolean exists;
        if (parts.length == 3) {
            try (PreparedStatement statement = connection.prepareStatement("""
                    SELECT 1
                    WHERE EXISTS (
                      SELECT 1
                      FROM information_schema.columns
                      WHERE table_schema = ?
                        AND table_name = ?
                        AND column_name = ?
                    )
                    """)) {
                statement.setString(1, parts[0]);
                statement.setString(2, parts[1]);
                statement.setString(3, parts[2]);
                try (ResultSet resultSet = statement.executeQuery()) {
                    exists = resultSet.next();
                }
            }
        } else if (parts.length == 2) {
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT 1 WHERE to_regclass(?) IS NOT NULL")) {
                statement.setString(1, qualifiedObject);
                try (ResultSet resultSet = statement.executeQuery()) {
                    exists = resultSet.next();
                }
            }
        } else {
            throw new IllegalArgumentException("Invalid migration sentinel: " + qualifiedObject);
        }
        return exists;
    }

    private void execute(String sql, SqlConsumer<PreparedStatement> binder) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            binder.accept(statement);
            statement.execute();
        }
    }

    public static String migrationChecksum(String sql) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(sql.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    @Override
    public void close() throws SQLException {
        connection.close();
    }

    public record MigrationFile(String filename, String sql) {}
    public record AppliedMigration(String checksum) {}

    public static final class MigrationResult {
        private final List<String> applied = new ArrayList<>();
        private final List<String> skipped = new ArrayList<>();
        private final List<String> baselined = new ArrayList<>();

        public List<String> applied() {
            return List.copyOf(applied);
        }

        public List<String> skipped() {
            return List.copyOf(skipped);
        }

        public List<String> baselined() {
            return List.copyOf(baselined);
        }

        void addApplied(String filename) {
            applied.add(filename);
        }

        void addSkipped(String filename) {
            skipped.add(filename);
        }

        void addBaselined(String filename) {
            baselined.add(filename);
        }
    }

    @FunctionalInterface
    private interface SqlConsumer<T> {
        void accept(T value) throws SQLException;
    }
}
