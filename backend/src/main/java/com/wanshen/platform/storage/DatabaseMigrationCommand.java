package com.wanshen.platform.storage;

import java.sql.DriverManager;
import java.util.Map;

public final class DatabaseMigrationCommand {
    private DatabaseMigrationCommand() {}

    public static void run(Map<String, String> environment) throws Exception {
        String migrationUrl = DatabaseUrls.jdbc(environment.getOrDefault("MIGRATION_DATABASE_URL", ""));
        String role = environment.getOrDefault("APP_DB_ROLE", "");
        if (migrationUrl.isBlank() || !role.matches("[A-Za-z_][A-Za-z0-9_]*")) {
            throw new IllegalArgumentException("MIGRATION_DATABASE_URL and valid APP_DB_ROLE are required");
        }
        try (var connection = DriverManager.getConnection(migrationUrl)) {
            try (var statement = connection.createStatement();
                 var row = statement.executeQuery("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user")) {
                if (!row.next() || !row.getBoolean(1)) {
                    throw new IllegalStateException("Dedicated migration role requires BYPASSRLS for historical cross-tenant seed migrations; never grant it to the application");
                }
            }
            try (var check = connection.prepareStatement("""
                    SELECT rolsuper, rolbypassrls, rolname = current_user, pg_has_role(oid, current_user, 'MEMBER')
                    FROM pg_roles WHERE rolname = ?
                    """)) {
                check.setString(1, role);
                try (var row = check.executeQuery()) {
                    if (!row.next() || row.getBoolean(1) || row.getBoolean(2) || row.getBoolean(3) || row.getBoolean(4)) {
                        throw new IllegalStateException("Runtime role must exist, be separate, NOSUPERUSER, NOBYPASSRLS and not a member of the migration role");
                    }
                }
            }
        }
        try (var migrator = PostgresDatabaseMigrator.open(migrationUrl)) {
            migrator.migrate(DatabaseMigrationRunner.migrationFiles(), System.out::println);
        }
        try (var connection = DriverManager.getConnection(migrationUrl)) {
            connection.setAutoCommit(false);
            String quotedRole = "\"" + role + "\"";
            try (var statement = connection.createStatement()) {
                statement.execute("GRANT USAGE ON SCHEMA public TO " + quotedRole);
                statement.execute("GRANT SELECT ON ALL TABLES IN SCHEMA public TO " + quotedRole);
                statement.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO " + quotedRole);
                try (var tables = connection.prepareStatement("""
                        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
                        """); var rows = tables.executeQuery()) {
                    while (rows.next()) {
                        String table = "\"" + rows.getString(1).replace("\"", "\"\"") + "\"";
                        statement.execute("GRANT INSERT, UPDATE, DELETE ON public." + table + " TO " + quotedRole);
                    }
                }
                statement.execute("REVOKE INSERT, UPDATE, DELETE ON public.schema_migrations FROM " + quotedRole);
            }
            connection.commit();
        }
        System.out.println("Verified Java migrations and runtime grants are current.");
    }
}
