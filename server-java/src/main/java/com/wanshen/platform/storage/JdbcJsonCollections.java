package com.wanshen.platform.storage;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.AbstractList;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JSONB aggregate persistence for services whose business logic already uses
 * tenant-keyed in-memory maps. Each Java map is backed by module_document and
 * is write-through; a database transaction wraps all writes for one request.
 */
public final class JdbcJsonCollections implements AutoCloseable {
    private final DataSource dataSource;
    private final ObjectMapper mapper;
    private final String module;
    private final ThreadLocal<Connection> transactionConnection = new ThreadLocal<>();
    private final ThreadLocal<String> transactionTenant = new ThreadLocal<>();
    private final List<TenantCache> tenantCaches = new ArrayList<>();

    private record Document(String kind, String id, JsonNode value) {}
    private interface TenantCache {
        void reload(String tenantId, List<Document> documents);
    }

    public JdbcJsonCollections(DataSource dataSource, ObjectMapper mapper, String module) {
        this.dataSource = dataSource;
        this.mapper = mapper;
        this.module = module;
    }

    public <T> T transaction(java.util.function.Supplier<T> work) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            transactionConnection.set(connection);
            try {
                T result = work.get();
                connection.commit();
                return result;
            } catch (RuntimeException exception) {
                connection.rollback();
                throw exception;
            } catch (Exception exception) {
                connection.rollback();
                throw new IllegalStateException(exception);
            } finally {
                transactionConnection.remove();
                transactionTenant.remove();
            }
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException(module + " transaction failed", exception);
        }
    }

    public synchronized <T> T transaction(String tenantId, java.util.function.Supplier<T> work) {
        if (transactionConnection.get() != null) {
            if (!tenantId.equals(transactionTenant.get())) {
                throw new IllegalStateException("Cross-tenant transaction is not allowed");
            }
            return work.get();
        }
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            transactionConnection.set(connection);
            transactionTenant.set(tenantId);
            try {
                bindTenant(connection, tenantId);
                // Serialize one tenant's inventory and sales facts across API/worker instances.
                execute(connection, "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", statement -> {
                    statement.setString(1, module + ":" + tenantId);
                    statement.execute();
                    return null;
                });
                reloadTenant(connection, tenantId);
                T result = work.get();
                connection.commit();
                return result;
            } catch (Exception exception) {
                connection.rollback();
                bindTenant(connection, tenantId);
                reloadTenant(connection, tenantId);
                throw exception instanceof RuntimeException runtime ? runtime : new IllegalStateException(exception);
            } finally {
                transactionConnection.remove();
                transactionTenant.remove();
            }
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException(module + " tenant transaction failed", exception);
        }
    }

    private void reloadTenant(Connection connection, String tenantId) {
        List<Document> documents = execute(connection, """
                SELECT kind, doc_id, data FROM module_document
                WHERE module = ? AND tenant_id = ? ORDER BY updated_at, doc_id
                """, statement -> {
            statement.setString(1, module);
            statement.setString(2, tenantId);
            List<Document> values = new ArrayList<>();
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) values.add(new Document(rows.getString(1), rows.getString(2), read(rows.getString(3))));
            }
            return values;
        });
        tenantCaches.forEach(cache -> cache.reload(tenantId, documents));
    }

    public List<String> pendingTenantIds(String kind, String eventType) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            bindTenant(connection, "bootstrap");
            bindBootstrapMode(connection);
            List<String> tenants = execute(connection, """
                    SELECT DISTINCT tenant_id FROM module_document
                    WHERE module = ? AND kind = ? AND data->>'status' IN ('PENDING', 'RETRY_WAIT') AND data->>'eventType' = ?
                    ORDER BY tenant_id
                    """, statement -> {
                statement.setString(1, module);
                statement.setString(2, kind);
                statement.setString(3, eventType);
                List<String> values = new ArrayList<>();
                try (ResultSet rows = statement.executeQuery()) {
                    while (rows.next()) values.add(rows.getString(1));
                }
                return values;
            });
            connection.commit();
            return tenants;
        } catch (Exception exception) {
            throw new IllegalStateException(module + " tenant discovery failed", exception);
        }
    }

    public Map<String, JsonNode> jsonMap(String kind) {
        PersistentJsonMap result = new PersistentJsonMap(kind);
        forEachDocument(kind, (tenantId, docId, value) -> result.install(mapKey(tenantId, docId), value));
        tenantCaches.add((tenantId, documents) -> {
            result.entrySet().removeIf(entry -> tenantOf(entry.getKey(), entry.getValue()).equals(tenantId));
            documents.stream().filter(document -> document.kind().equals(kind))
                    .forEach(document -> result.install(mapKey(tenantId, document.id()), document.value()));
        });
        return result;
    }

    public List<JsonNode> jsonList(String kind, java.util.function.Function<JsonNode, String> itemId) {
        PersistentJsonList result = new PersistentJsonList(kind, itemId);
        forEachDocument(kind, (tenantId, docId, value) -> result.install(value));
        tenantCaches.add((tenantId, documents) -> {
            result.values.removeIf(value -> tenantId.equals(value.path("tenantId").asText()));
            documents.stream().filter(document -> document.kind().equals(kind))
                    .forEach(document -> result.install(document.value()));
        });
        return result;
    }

    public Map<String, List<JsonNode>> jsonListMap(String kind) {
        PersistentJsonListMap result = new PersistentJsonListMap(kind);
        forEachDocument(kind, (tenantId, docId, value) -> {
            List<JsonNode> values = new ArrayList<>();
            value.withArray("events").forEach(values::add);
            result.install(mapKey(tenantId, docId), tenantId, values);
        });
        tenantCaches.add((tenantId, documents) -> {
            result.entrySet().removeIf(entry -> entry.getKey().startsWith(tenantId + ":"));
            documents.stream().filter(document -> document.kind().equals(kind)).forEach(document -> {
                List<JsonNode> values = new ArrayList<>();
                document.value().withArray("events").forEach(value -> values.add(value.deepCopy()));
                result.install(mapKey(tenantId, document.id()), tenantId, values);
            });
        });
        return result;
    }

    private String mapKey(String tenantId, String docId) {
        return (module.equals("fulfillment") || module.equals("production")) && !docId.startsWith(tenantId + ":")
                ? tenantId + ":" + docId : docId;
    }

    private void forEachDocument(String kind, DocumentReader reader) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            bindTenant(connection, "bootstrap");
            bindBootstrapMode(connection);
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT tenant_id, doc_id, data FROM module_document WHERE module = ? AND kind = ? ORDER BY doc_id"
            )) {
                statement.setString(1, module);
                statement.setString(2, kind);
                try (ResultSet resultSet = statement.executeQuery()) {
                    while (resultSet.next()) {
                        reader.read(resultSet.getString(1), resultSet.getString(2), read(resultSet.getString(3)));
                    }
                }
            }
            connection.commit();
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to load " + module + "/" + kind, exception);
        }
    }

    private void putDocument(String tenantId, String kind, String docId, JsonNode value) {
        scoped(tenantId, connection -> execute(connection, """
                INSERT INTO module_document (module, tenant_id, kind, doc_id, data)
                VALUES (?, ?, ?, ?, ?::jsonb)
                ON CONFLICT (module, tenant_id, kind, doc_id)
                DO UPDATE SET data = EXCLUDED.data, updated_at = now()
                """, statement -> {
            statement.setString(1, module);
            statement.setString(2, tenantId);
            statement.setString(3, kind);
            statement.setString(4, docId);
            statement.setString(5, write(value));
            statement.executeUpdate();
            return null;
        }));
    }

    private void deleteDocument(String tenantId, String kind, String docId) {
        scoped(tenantId, connection -> execute(connection,
                "DELETE FROM module_document WHERE module = ? AND tenant_id = ? AND kind = ? AND doc_id = ?",
                statement -> {
                    statement.setString(1, module);
                    statement.setString(2, tenantId);
                    statement.setString(3, kind);
                    statement.setString(4, docId);
                    statement.executeUpdate();
                    return null;
                }));
    }

    private void putListDocument(String tenantId, String kind, String docId, List<JsonNode> events) {
        ObjectNode value = mapper.createObjectNode();
        ArrayNode eventsNode = value.putArray("events");
        events.forEach(eventsNode::add);
        putDocument(tenantId, kind, docId, value);
    }

    private <T> T scoped(String tenantId, SqlFunction<Connection, T> work) {
        Connection active = transactionConnection.get();
        if (active != null) {
            String bound = transactionTenant.get();
            if (bound == null) {
                bindTenant(active, tenantId);
                transactionTenant.set(tenantId);
            } else if (!bound.equals(tenantId)) {
                throw new IllegalStateException("Cross-tenant transaction is not allowed");
            }
            return apply(active, work);
        }
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            bindTenant(connection, tenantId);
            try {
                T result = apply(connection, work);
                connection.commit();
                return result;
            } catch (Exception exception) {
                connection.rollback();
                throw exception instanceof RuntimeException runtime ? runtime : new IllegalStateException(exception);
            }
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException(module + " JSON write failed", exception);
        }
    }

    private <T> T apply(Connection connection, SqlFunction<Connection, T> work) {
        try {
            return work.apply(connection);
        } catch (Exception exception) {
            throw exception instanceof RuntimeException runtime ? runtime : new IllegalStateException(exception);
        }
    }

    private void bindTenant(Connection connection, String tenantId) {
        execute(connection, "SELECT set_config('app.tenant_id', ?, true)", statement -> {
            statement.setString(1, tenantId);
            statement.execute();
            return null;
        });
    }

    private void bindBootstrapMode(Connection connection) {
        execute(connection, "SELECT set_config('app.bootstrap_mode', 'true', true)", statement -> {
            statement.execute();
            return null;
        });
    }

    private <T> T execute(Connection connection, String sql, SqlFunction<PreparedStatement, T> binder) {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            return binder.apply(statement);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private JsonNode read(String json) {
        try {
            return mapper.readTree(json);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private String write(JsonNode value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static String tenantOf(String mapKey, JsonNode value) {
        String fromValue = value.path("tenantId").asText("");
        if (!fromValue.isBlank()) return fromValue;
        int separator = mapKey.indexOf(':');
        return separator < 0 ? "system" : mapKey.substring(0, separator);
    }

    public void close() {
    }

    private final class PersistentJsonMap extends LinkedHashMap<String, JsonNode> {
        private final String kind;

        private PersistentJsonMap(String kind) {
            this.kind = kind;
        }

        private void install(String docId, JsonNode value) {
            super.put(docId, value.deepCopy());
        }

        @Override
        public JsonNode put(String key, JsonNode value) {
            JsonNode previous = super.put(key, value.deepCopy());
            putDocument(tenantOf(key, value), kind, key, value);
            return previous;
        }

        @Override
        public JsonNode remove(Object key) {
            JsonNode previous = super.remove(key);
            if (previous != null) deleteDocument(tenantOf(String.valueOf(key), previous), kind, String.valueOf(key));
            return previous;
        }
    }

    private final class PersistentJsonList extends AbstractList<JsonNode> {
        private final String kind;
        private final java.util.function.Function<JsonNode, String> itemId;
        private final List<JsonNode> values = new ArrayList<>();

        private PersistentJsonList(String kind, java.util.function.Function<JsonNode, String> itemId) {
            this.kind = kind;
            this.itemId = itemId;
        }

        private void install(JsonNode value) {
            values.add(value.deepCopy());
        }

        @Override
        public JsonNode get(int index) {
            return values.get(index).deepCopy();
        }

        @Override
        public int size() {
            return values.size();
        }

        @Override
        public JsonNode set(int index, JsonNode element) {
            JsonNode previous = values.set(index, element.deepCopy());
            putDocument(element.path("tenantId").asText("system"), kind, itemId.apply(element), element);
            return previous;
        }

        @Override
        public void add(int index, JsonNode element) {
            values.add(index, element.deepCopy());
            putDocument(element.path("tenantId").asText("system"), kind, itemId.apply(element), element);
        }

        @Override
        public JsonNode remove(int index) {
            JsonNode previous = values.remove(index);
            deleteDocument(previous.path("tenantId").asText("system"), kind, itemId.apply(previous));
            return previous;
        }
    }

    private final class PersistentJsonListMap extends LinkedHashMap<String, List<JsonNode>> {
        private final String kind;

        private PersistentJsonListMap(String kind) {
            this.kind = kind;
        }

        private void install(String mapKey, String tenantId, List<JsonNode> values) {
            super.put(mapKey, new PersistentInnerList(kind, mapKey, tenantId, values));
        }

        @Override
        public List<JsonNode> computeIfAbsent(String key, java.util.function.Function<? super String, ? extends List<JsonNode>> function) {
            List<JsonNode> existing = get(key);
            if (existing != null) return existing;
            List<JsonNode> created = new PersistentInnerList(kind, key, tenantPrefix(key), new ArrayList<>());
            put(key, created);
            return created;
        }

        private String tenantPrefix(String key) {
            int separator = key.indexOf(':');
            return separator < 0 ? "system" : key.substring(0, separator);
        }
    }

    private final class PersistentInnerList extends AbstractList<JsonNode> {
        private final String kind;
        private final String mapKey;
        private final String tenantId;
        private final List<JsonNode> values;

        private PersistentInnerList(String kind, String mapKey, String tenantId, List<JsonNode> values) {
            this.kind = kind;
            this.mapKey = mapKey;
            this.tenantId = tenantId;
            this.values = values;
        }

        @Override
        public JsonNode get(int index) {
            return values.get(index).deepCopy();
        }

        @Override
        public int size() {
            return values.size();
        }

        @Override
        public void add(int index, JsonNode element) {
            values.add(index, element.deepCopy());
            putListDocument(tenantId, kind, mapKey, values);
        }
    }

    @FunctionalInterface
    private interface DocumentReader {
        void read(String tenantId, String docId, JsonNode value);
    }

    @FunctionalInterface
    private interface SqlFunction<T, R> {
        R apply(T value) throws Exception;
    }
}
