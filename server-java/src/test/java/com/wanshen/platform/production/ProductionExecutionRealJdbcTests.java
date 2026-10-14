package com.wanshen.platform.production;

import com.wanshen.platform.fulfillment.JdbcFulfillmentStore;
import com.wanshen.platform.storage.PostgresDatabaseMigrator;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static com.wanshen.platform.production.ProductionExecutionTests.*;

@EnabledIfEnvironmentVariable(named = "JAVA_JDBC_URL", matches = ".+")
class ProductionExecutionRealJdbcTests {
    @BeforeAll static void migrate() throws Exception {
        String url = System.getenv("JAVA_JDBC_MIGRATION_URL");
        if (url == null) url = System.getenv("JAVA_JDBC_URL");
        try (var migrator = PostgresDatabaseMigrator.open(url)) {
            var files = new java.util.ArrayList<PostgresDatabaseMigrator.MigrationFile>();
            for (var resource : new PathMatchingResourcePatternResolver().getResources("classpath*:db/migrations/*.sql")) {
                files.add(new PostgresDatabaseMigrator.MigrationFile(resource.getFilename(),
                        resource.getContentAsString(java.nio.charset.StandardCharsets.UTF_8)));
            }
            files.sort(java.util.Comparator.comparing(PostgresDatabaseMigrator.MigrationFile::filename));
            migrator.migrate(files, ignored -> {});
        }
    }
    HikariDataSource dataSource() {
        var config = new HikariConfig();
        config.setJdbcUrl(System.getenv("JAVA_JDBC_URL"));
        config.setMaximumPoolSize(4);
        return new HikariDataSource(config);
    }
    @Test void publishedBomAndRoutingSurviveConnectionReload() {
        String tenant = "bom-jdbc-" + UUID.randomUUID();
        try (var data = dataSource(); var production = new JdbcProductionStore(data, MAPPER)) {
            var service = new ProductionService(production, MAPPER);
            service.saveBom(context(tenant, "admin", "publish", null), ProductionBomSnapshotTests.bom());
        }
        try (var data = dataSource(); var production = new JdbcProductionStore(data, MAPPER)) {
            var service = new ProductionService(production, MAPPER);
            var bom = service.listBoms(context(tenant, "admin", "read", null)).get(0);
            assertThat(bom.path("routingSnapshot").path("operations").get(0).path("standardMinutes").asText()).isEqualTo("1.5");
            assertThat(service.listBoms(context("OTHER", "admin", "read", null))).isEmpty();
        }
    }
    @Test void fullChainAndSecondReceiptSurviveReloadAndAreTenantScoped() {
        String tenant = "production-jdbc-" + UUID.randomUUID();
        String id;
        try (var data = dataSource(); var production = new JdbcProductionStore(data, MAPPER);
             var inventory = new JdbcFulfillmentStore(data, MAPPER)) {
            id = runChain(production, inventory, tenant);
        }
        try (var data = dataSource(); var production = new JdbcProductionStore(data, MAPPER);
             var inventory = new JdbcFulfillmentStore(data, MAPPER)) {
            var service = service(production, inventory);
            assertThat(service.workOrder(context(tenant, "reviewer", "read", null), id).path("status").asText()).isEqualTo("CLOSED");
            assertThat(service.completions(context(tenant, "reviewer", "read", null), id)).hasSize(2);
            inventory.transaction(tenant, repository -> {
                assertThat(repository.transactions(tenant)).hasSize(3);
                assertThat(repository.availability(tenant, "FG-WH", "FG1").orElseThrow().path("qualifiedOnHandQty").asText()).isEqualTo("10");
                return null;
            });
            assertThatThrownBy(() -> service.workOrder(context("OTHER", "reviewer", "read", null), id))
                    .isInstanceOf(com.wanshen.platform.web.ApiException.class);
        }
    }
    @Test void legacyUnqualifiedDemandAndInspectionAreAddressable() throws Exception {
        String tenant = "production-legacy-" + UUID.randomUUID();
        try (var data = dataSource(); var connection = data.getConnection()) {
            connection.setAutoCommit(false);
            try (var bind = connection.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
                bind.setString(1, tenant); bind.execute();
            }
            try (var statement = connection.prepareStatement(
                    "INSERT INTO module_document(module,tenant_id,kind,doc_id,data) VALUES ('production',?,?,?,?::jsonb)")) {
                for (String kind : java.util.List.of("demand", "inspection")) {
                    statement.setString(1, tenant); statement.setString(2, kind); statement.setString(3, "legacy");
                    statement.setString(4, "{\"id\":\"legacy\",\"tenantId\":\"" + tenant + "\",\"status\":\"RECEIVED\",\"version\":1}");
                    statement.executeUpdate();
                }
            }
            connection.commit();
            try (var production = new JdbcProductionStore(data, MAPPER)) {
                production.transaction(tenant, repository -> {
                    assertThat(repository.demand(tenant, "legacy")).isPresent();
                    assertThat(repository.inspection(tenant, "legacy")).isPresent();
                    return null;
                });
            }
        }
    }

    @Test void salesShortageFullChainSurvivesReload() {
        String tenant = "production-sales-jdbc-" + UUID.randomUUID();
        String orderId;
        try (var data = dataSource(); var production = new JdbcProductionStore(data, MAPPER);
             var inventory = new JdbcFulfillmentStore(data, MAPPER)) {
            orderId = ProductionSalesChainTests.salesChain(production, inventory, tenant);
        }
        try (var data = dataSource(); var inventory = new JdbcFulfillmentStore(data, MAPPER)) {
            inventory.transaction(tenant, repository -> {
                assertThat(repository.order(tenant, orderId).orElseThrow().path("overallStatus").asText()).isEqualTo("SHIPPED");
                assertThat(repository.transactions(tenant)).hasSize(4);
                assertThat(repository.orders("OTHER")).isEmpty();
                return null;
            });
        }
    }
}
