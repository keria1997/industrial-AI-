import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const connection = new URL(process.env.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(connection.hostname)) {
  throw new Error("Production verification requires a local test database");
}
const database = process.env.JAVA_JDBC_TEST_DATABASE || "shipment_flow_test_20261013";
const role = process.env.JAVA_JDBC_APP_ROLE || "shipment_flow_test_app_20261013";
const jdbc = process.env.JAVA_JDBC_URL || `jdbc:postgresql://${connection.host}/${database}?user=${role}`;
const migration = process.env.JAVA_JDBC_MIGRATION_URL || `jdbc:postgresql://${connection.host}/${database}?user=${connection.username}`;
const testConnection = new URL(connection);
testConnection.pathname = `/${database}`;
testConnection.username = role;
testConnection.password = "";
const result = spawnSync("mvn", ["-f", "server-java/pom.xml", "-o", "test"], {
  env: { ...process.env, DATABASE_URL: testConnection.href, JAVA_JDBC_URL: jdbc,
    JAVA_JDBC_MIGRATION_URL: migration, JAVA_JDBC_APP_ROLE: role, APP_DATABASE_MIGRATE: "false" },
  stdio: "inherit",
});
process.exitCode = result.status ?? 1;
