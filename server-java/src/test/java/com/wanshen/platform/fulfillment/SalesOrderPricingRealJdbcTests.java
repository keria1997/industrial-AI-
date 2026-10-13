package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.sql.Connection;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnabledIfEnvironmentVariable(named = "JAVA_JDBC_URL", matches = ".+")
class SalesOrderPricingRealJdbcTests {
    @Test
    void discountedPriceSurvivesConfirmationAndDatabaseReload() throws Exception {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(System.getenv("JAVA_JDBC_URL"));
        config.setMaximumPoolSize(2);
        ObjectMapper mapper = new ObjectMapper();
        String tenant = "price-jdbc-" + UUID.randomUUID();
        try (HikariDataSource dataSource = new HikariDataSource(config)) {
            try {
                String id;
                try (JdbcFulfillmentStore store = new JdbcFulfillmentStore(dataSource, mapper)) {
                    FulfillmentService service = new FulfillmentService(store, mapper, "test-key",
                            "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY");
                    var input = SalesOrderPricingTests.input(mapper);
                    var created = service.createOrder(SalesOrderPricingTests.context(tenant, null), input).body();
                    id = created.path("id").asText();
                    service.decideReview(SalesOrderPricingTests.context(tenant, 1), id,
                            mapper.createObjectNode().put("decision", "APPROVE"));
                    var confirmed = service.confirmOrder(SalesOrderPricingTests.context(tenant, 2), id,
                            mapper.createObjectNode().put("requestedDeliveryDate", input.path("requestedDeliveryDate").asText())).body();
                    assertEquals(created.path("totalAmount"), confirmed.path("totalAmount"));
                }
                try (Connection connection = dataSource.getConnection();
                     var statement = connection.prepareStatement(
                             "select data from module_document where module='fulfillment' and tenant_id=? and kind='order'")) {
                    connection.setAutoCommit(false);
                    bindTenant(connection, tenant);
                    statement.setString(1, tenant);
                    try (var rows = statement.executeQuery()) {
                        assertTrue(rows.next());
                        var saved = mapper.readTree(rows.getString(1));
                        assertEquals("CONFIRMED", saved.path("overallStatus").asText());
                        assertEquals("9133", saved.path("totalAmount").asText());
                        assertEquals("95", saved.path("discountRate").asText());
                        assertEquals("120", saved.path("discountAmount").asText());
                    }
                    connection.commit();
                }
                try (JdbcFulfillmentStore reloaded = new JdbcFulfillmentStore(dataSource, mapper)) {
                    assertEquals("9133", reloaded.order(tenant, id).orElseThrow().path("totalAmount").asText());
                }
            } finally {
                try (Connection connection = dataSource.getConnection();
                     var statement = connection.prepareStatement(
                             "delete from module_document where module='fulfillment' and tenant_id=?")) {
                    connection.setAutoCommit(false);
                    bindTenant(connection, tenant);
                    statement.setString(1, tenant);
                    statement.executeUpdate();
                    connection.commit();
                }
            }
        }
    }

    private void bindTenant(Connection connection, String tenant) throws Exception {
        try (var statement = connection.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
            statement.setString(1, tenant);
            statement.execute();
        }
    }
}
