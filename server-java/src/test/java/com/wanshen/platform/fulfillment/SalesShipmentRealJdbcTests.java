package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import com.wanshen.platform.storage.PostgresDatabaseMigrator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.sql.DriverManager;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static com.wanshen.platform.fulfillment.SalesShipmentWorkflowTests.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

@EnabledIfEnvironmentVariable(named = "JAVA_JDBC_URL", matches = ".+")
class SalesShipmentRealJdbcTests {
    @BeforeAll
    static void migrate() throws Exception {
        String url = System.getenv("JAVA_JDBC_MIGRATION_URL");
        if (url == null || url.isBlank()) url = System.getenv("JAVA_JDBC_URL");
        try (var migrator = PostgresDatabaseMigrator.open(url)) {
            var resources = new org.springframework.core.io.support.PathMatchingResourcePatternResolver()
                    .getResources("classpath*:db/migrations/*.sql");
            var files = new java.util.ArrayList<PostgresDatabaseMigrator.MigrationFile>();
            for (var resource : resources) {
                files.add(new PostgresDatabaseMigrator.MigrationFile(resource.getFilename(),
                        resource.getContentAsString(java.nio.charset.StandardCharsets.UTF_8)));
            }
            files.sort(java.util.Comparator.comparing(PostgresDatabaseMigrator.MigrationFile::filename));
            migrator.migrate(files, ignored -> {});
        }
        String role = System.getenv("JAVA_JDBC_APP_ROLE");
        if (role != null && role.matches("[A-Za-z_][A-Za-z0-9_]*")) {
            try (var connection = DriverManager.getConnection(url); var statement = connection.createStatement()) {
                statement.execute("GRANT USAGE ON SCHEMA public TO \"" + role + "\"");
                statement.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"" + role + "\"");
                statement.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO \"" + role + "\"");
            }
        }
    }

    private HikariDataSource dataSource() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(System.getenv("JAVA_JDBC_URL"));
        config.setMaximumPoolSize(4);
        return new HikariDataSource(config);
    }

    @Test
    void quickOrderMetadataAndReplaySurviveDatabaseReload() {
        String tenant = "quick-order-metadata-" + UUID.randomUUID();
        var input = QuickSalesOrderMetadataTests.input();
        JsonNode order;
        try (var dataSource = dataSource()) {
            try (var store = new JdbcFulfillmentStore(dataSource, MAPPER)) {
                order = service(store).createOrder(context(tenant, null, "quick-order-metadata"), input).body();
            }
            try (var store = new JdbcFulfillmentStore(dataSource, MAPPER)) {
                var service = service(store);
                QuickSalesOrderMetadataTests.assertMetadata(
                        service.order(context(tenant, null, null), order.path("id").asText()), input);
                var replay = service.createOrder(context(tenant, null, "quick-order-metadata"), input);
                assertThat(replay.replayed()).isTrue();
                assertThat(replay.body()).isEqualTo(order);
                assertThat(store.orders(tenant)).hasSize(1);
                assertThat(store.orders("other-tenant")).noneMatch(value -> value.path("id").equals(order.path("id")));
                assertThat(store.shipmentTasks(tenant)).isEmpty();
            }
        }
    }

    @Test
    void legacyWarehouseMappingAndDeductionSurviveDatabaseReload() {
        String tenant = "warehouse-mapping-jdbc-" + UUID.randomUUID();
        JsonNode fact;
        try (var dataSource = dataSource()) {
            try (var store = new JdbcFulfillmentStore(dataSource, MAPPER)) {
                fact = InventoryWarehouseFactsTests.shipLegacyFact(service(store), tenant);
            }
            try (var store = new JdbcFulfillmentStore(dataSource, MAPPER)) {
                var service = service(store);
                assertThat(service.availability(context(tenant, null, null), null, null)).containsExactly(fact);
                assertThat(service.availability(context(tenant, null, null), "WH-TEST", java.util.List.of("FG-0"))).containsExactly(fact);
                assertThat(service.availability(context("other", null, null), null, null)).doesNotContain(fact);
                assertThat(store.transactions(tenant)).hasSize(1);
            }
        }
    }

    @Test
    void legacyComponentMigrationUsesPersistedAmountsAndIsRepeatable() throws Exception {
        String tenant = "legacy-stock-components-" + UUID.randomUUID();
        String migration = new org.springframework.core.io.ClassPathResource(
                "db/migrations/028_inventory_fact_components.sql").getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        try (var connection = DriverManager.getConnection(System.getenv("JAVA_JDBC_MIGRATION_URL"))) {
            connection.setAutoCommit(false);
            try (var statement = connection.prepareStatement(
                    "INSERT INTO module_document(module,tenant_id,kind,doc_id,data) VALUES('fulfillment',?,'availability',?,?::jsonb)")) {
                statement.setString(1, tenant);
                statement.setString(2, tenant + ":WH-TEST:FG-0");
                statement.setString(3, MAPPER.createObjectNode().put("tenantId", tenant).put("warehouseId", "WH-TEST")
                        .put("productId", "FG-0").put("onHandQty", "99").put("qualifiedOnHandQty", "8.3")
                        .put("reservedQty", "1.1").put("safetyStockQty", "3.2").put("fulfillableQty", "98")
                        .put("uom", "PCS").put("factVersion", 4).toString());
                statement.executeUpdate();
            }
            try (var statement = connection.createStatement()) {
                statement.execute(migration);
                statement.execute(migration);
            }
            connection.commit();
        }
        try (var dataSource = dataSource(); var store = new JdbcFulfillmentStore(dataSource, MAPPER)) {
            JsonNode fact = service(store).availability(context(tenant, null, null), null, null).get(0);
            assertThat(fact.path("qualifiedOnHandQty").asText()).isEqualTo("8.3");
            assertThat(fact.path("allocatedReservedQty").asText()).isEqualTo("1.1");
            assertThat(fact.path("fulfillableQty").asText()).isEqualTo("4.0");
            assertThat(fact.path("factVersion").asInt()).isEqualTo(5);
            assertThat(fact.has("onHandQty")).isFalse();
        }
    }

    @Test
    void realDatabasePreservesRequestPostingReplayAndSalesAfterReload() {
        String tenant = "shipment-jdbc-" + UUID.randomUUID();
        String orderId;
        JsonNode outbound;
        JsonNode posted;
        try (var dataSource = dataSource()) {
            try (var store = new JdbcFulfillmentStore(dataSource, MAPPER)) {
                var service = service(store);
                JsonNode order = confirmed(service, tenant, true, "0.3");
                orderId = order.path("id").asText();
                stock(service, tenant, "FG-0", "0.3", "0");
                outbound = reserve(service, tenant, request(service, tenant, order, null)).path("outbound");
                posted = post(service, tenant, outbound, Map.of("FG-0", "0.1"));
                assertThat(posted.path("order").path("lines").get(0).path("remainingQty").asText()).isEqualTo("0.2");
            }
            try (var store = new JdbcFulfillmentStore(dataSource, MAPPER)) {
                var service = service(store);
                assertThat(post(service, tenant, outbound, Map.of("FG-0", "0.1"))).isEqualTo(posted);
                assertThat(store.transactions(tenant)).hasSize(1);
                JsonNode nextOutbound = service.outbound(context(tenant, null, null), outbound.path("id").asText());
                JsonNode completed = post(service, tenant, nextOutbound, Map.of("FG-0", "0.2"));
                assertThat(completed.path("order").path("overallStatus").asText()).isEqualTo("SHIPPED");
                assertThat(store.transactions(tenant)).hasSize(2);
                var exception = assertThrows(com.wanshen.platform.web.ApiException.class, () ->
                        service.order(context("different-tenant", null, null), orderId));
                assertThat(exception.status()).isEqualTo(404);
            }
            try (var store = new JdbcFulfillmentStore(dataSource, MAPPER)) {
                var service = service(store);
                JsonNode order = service.order(context(tenant, null, null), orderId);
                assertThat(order.path("overallStatus").asText()).isEqualTo("SHIPPED");
                assertThat(order.path("lines").get(0).path("shippedQty").asText()).isEqualTo("0.3");
                assertThat(order.path("lines").get(0).path("activeRequestedQty").asText()).isEqualTo("0");
                assertThat(store.transactions(tenant)).hasSize(2);
                assertThat(store.pendingOutbox(tenant)).anyMatch(event ->
                        event.path("eventType").asText().equals("inventory.sales-outbound.posted.v1")
                                && event.path("payload").path("lines").get(0).path("cumulativePostedQty").asText().equals("0.3"));
            }
        }
    }

    @Test
    void twoApiInstancesSerializeInventoryAndRefreshTheirDatabaseFacts() throws Exception {
        String tenant = "shipment-concurrent-" + UUID.randomUUID();
        try (var dataSource = dataSource();
             var firstStore = new JdbcFulfillmentStore(dataSource, MAPPER);
             var secondStore = new JdbcFulfillmentStore(dataSource, MAPPER)) {
            var first = service(firstStore);
            var second = service(secondStore);
            JsonNode firstOrder = confirmed(first, tenant, false, "4");
            JsonNode secondOrder = confirmed(second, tenant, false, "4");
            stock(first, tenant, "FG-0", "5", "0");
            JsonNode firstTask = request(first, tenant, firstOrder, null);
            JsonNode secondTask = request(second, tenant, secondOrder, null);
            var ready = new CountDownLatch(2);
            var start = new CountDownLatch(1);
            var executor = Executors.newFixedThreadPool(2);
            try {
                var a = executor.submit(() -> { ready.countDown(); start.await(); return reserve(first, tenant, firstTask); });
                var b = executor.submit(() -> { ready.countDown(); start.await(); return reserve(second, tenant, secondTask); });
                assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
                start.countDown();
                var outcomes = java.util.List.of(a.get(20, TimeUnit.SECONDS).path("outcome").asText(),
                        b.get(20, TimeUnit.SECONDS).path("outcome").asText());
                assertThat(outcomes).containsExactlyInAnyOrder("SUCCEEDED", "SHORTAGE");
            } finally {
                executor.shutdownNow();
            }
            JsonNode fact = first.availability(context(tenant, null, null), "WH-TEST", java.util.List.of("FG-0")).get(0);
            assertThat(fact.path("allocatedReservedQty").asText()).isEqualTo("4");
            assertThat(fact.path("fulfillableQty").asText()).isEqualTo("1");
            assertThat(second.order(context(tenant, null, null), firstOrder.path("id").asText()).path("id"))
                    .isEqualTo(firstOrder.path("id"));
        }
    }

    @Test
    void failedSalesWriteRollsBackDatabaseAndLiveCachesBeforeSameCommandRetry() {
        String tenant = "shipment-rollback-" + UUID.randomUUID();
        class FailingStore extends JdbcFulfillmentStore {
            boolean fail;
            FailingStore(javax.sql.DataSource source) { super(source, MAPPER); }
            @Override public synchronized void saveOrder(JsonNode value) {
                super.saveOrder(value);
                if (fail && value.path("overallStatus").asText().equals("SHIPPED")) throw new IllegalStateException("sales write failed");
            }
        }
        try (var dataSource = dataSource(); var store = new FailingStore(dataSource)) {
            var service = service(store);
            JsonNode order = confirmed(service, tenant, true, "5");
            stock(service, tenant, "FG-0", "5", "0");
            JsonNode outbound = reserve(service, tenant, request(service, tenant, order, null)).path("outbound");
            JsonNode fact = store.availability(tenant, "WH-TEST", "FG-0").orElseThrow();
            store.fail = true;
            assertThrows(IllegalStateException.class, () -> post(service, tenant, outbound, Map.of("FG-0", "5")));
            assertThat(store.outbound(tenant, outbound.path("id").asText()).orElseThrow()).isEqualTo(outbound);
            assertThat(store.availability(tenant, "WH-TEST", "FG-0").orElseThrow()).isEqualTo(fact);
            assertThat(store.transactions(tenant)).isEmpty();
            try (var reloaded = new JdbcFulfillmentStore(dataSource, MAPPER)) {
                assertThat(reloaded.outbound(tenant, outbound.path("id").asText()).orElseThrow()).isEqualTo(outbound);
                assertThat(reloaded.transactions(tenant)).isEmpty();
            }
            store.fail = false;
            assertThat(post(service, tenant, outbound, Map.of("FG-0", "5")).path("order").path("overallStatus").asText()).isEqualTo("SHIPPED");
            assertThat(store.transactions(tenant)).hasSize(1);
        }
    }
}
