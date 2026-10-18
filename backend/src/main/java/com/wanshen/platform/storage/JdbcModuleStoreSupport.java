package com.wanshen.platform.storage;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.storage.ModuleInfra.AuditLog;
import com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord;
import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Supplier;

public abstract class JdbcModuleStoreSupport implements AutoCloseable {
    private final DataSource dataSource;
    private final ObjectMapper objectMapper;
    private final String module;
    private final ThreadLocal<Connection> transactionConnection = new ThreadLocal<>();
    private final ThreadLocal<String> transactionTenant = new ThreadLocal<>();

    protected JdbcModuleStoreSupport(DataSource dataSource, ObjectMapper objectMapper, String module) {
        this.dataSource = dataSource;
        this.objectMapper = objectMapper;
        this.module = module;
    }

    protected DataSource dataSource() { return dataSource; }

    protected ObjectMapper objectMapper() { return objectMapper; }

    public <T> T transaction(Supplier<T> work) {
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

    protected <T> List<T> documents(String tenantId, String kind, Class<T> type) {
        return scoped(tenantId, connection -> {
            List<T> result = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT data FROM module_document WHERE module = ? AND tenant_id = ? AND kind = ?"
            )) {
                statement.setString(1, module);
                statement.setString(2, tenantId);
                statement.setString(3, kind);
                try (ResultSet resultSet = statement.executeQuery()) {
                    while (resultSet.next()) result.add(read(resultSet.getString(1), type));
                }
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
            return result;
        });
    }

    protected <T> Optional<T> document(String tenantId, String kind, String id, Class<T> type) {
        return scoped(tenantId, connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT data FROM module_document WHERE module = ? AND tenant_id = ? AND kind = ? AND doc_id = ?"
            )) {
                statement.setString(1, module);
                statement.setString(2, tenantId);
                statement.setString(3, kind);
                statement.setString(4, id);
                try (ResultSet resultSet = statement.executeQuery()) {
                    return resultSet.next() ? Optional.of(read(resultSet.getString(1), type)) : Optional.<T>empty();
                }
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });
    }

    protected void putDocument(String tenantId, String kind, String id, Object value) {
        scoped(tenantId, connection -> execute(connection, """
                INSERT INTO module_document (module, tenant_id, kind, doc_id, data)
                VALUES (?, ?, ?, ?, ?::jsonb)
                ON CONFLICT (module, tenant_id, kind, doc_id)
                DO UPDATE SET data = EXCLUDED.data, updated_at = now()
                """, statement -> {
            statement.setString(1, module);
            statement.setString(2, tenantId);
            statement.setString(3, kind);
            statement.setString(4, id);
            statement.setString(5, write(value));
            return null;
        }));
    }

    protected void deleteDocument(String tenantId, String kind, String id) {
        scoped(tenantId, connection -> execute(connection,
                "DELETE FROM module_document WHERE module = ? AND tenant_id = ? AND kind = ? AND doc_id = ?",
                statement -> {
                    statement.setString(1, module);
                    statement.setString(2, tenantId);
                    statement.setString(3, kind);
                    statement.setString(4, id);
                    return null;
                }));
    }

    public void addOutbox(OutboxEvent event) {
        scoped(event.tenantId(), connection -> execute(connection, """
                INSERT INTO module_outbox_event (module, tenant_id, event_id, status, attempts, data)
                VALUES (?, ?, ?, ?, ?, ?::jsonb)
                ON CONFLICT (module, tenant_id, event_id)
                DO UPDATE SET data = EXCLUDED.data, status = EXCLUDED.status,
                              attempts = EXCLUDED.attempts, updated_at = now()
                """, statement -> {
            statement.setString(1, module);
            statement.setString(2, event.tenantId());
            statement.setString(3, event.eventId());
            statement.setString(4, event.status());
            statement.setInt(5, event.attempts());
            statement.setString(6, write(event));
            return null;
        }));
    }

    public List<OutboxEvent> pendingModuleOutbox(String tenantId) {
        return scoped(tenantId, connection -> {
            List<OutboxEvent> result = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT data FROM module_outbox_event WHERE module = ? AND tenant_id = ? AND status = 'PENDING' ORDER BY created_at"
            )) {
                statement.setString(1, module);
                statement.setString(2, tenantId);
                try (ResultSet resultSet = statement.executeQuery()) {
                    while (resultSet.next()) result.add(read(resultSet.getString(1), OutboxEvent.class));
                }
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
            return result;
        });
    }

    public List<String> pendingOutboxTenantIds() {
        return scoped("infra", connection -> {
            bindBootstrapMode(connection);
            List<String> result = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT DISTINCT tenant_id FROM module_outbox_event WHERE module = ? AND status = 'PENDING' ORDER BY tenant_id"
            )) {
                statement.setString(1, module);
                try (ResultSet resultSet = statement.executeQuery()) {
                    while (resultSet.next()) result.add(resultSet.getString(1));
                }
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
            return result;
        });
    }

    private void bindBootstrapMode(Connection connection) {
        execute(connection, "SELECT set_config('app.bootstrap_mode', 'true', true)", statement -> {
            return null;
        });
    }

    public void markOutboxPublished(String tenantId, String eventId) {
        scoped(tenantId, connection -> execute(connection, """
                UPDATE module_outbox_event SET status = 'PUBLISHED', updated_at = now()
                WHERE module = ? AND tenant_id = ? AND event_id = ?
                """, statement -> {
            statement.setString(1, module);
            statement.setString(2, tenantId);
            statement.setString(3, eventId);
            return null;
        }));
    }

    public void markOutboxFailed(String tenantId, String eventId, String error, int maxAttempts) {
        scoped(tenantId, connection -> execute(connection, """
                UPDATE module_outbox_event
                SET attempts = attempts + 1,
                    status = CASE WHEN attempts + 1 >= ? THEN 'DEAD_LETTER' ELSE 'PENDING' END,
                    data = jsonb_set(jsonb_set(data, '{lastError}', to_jsonb(?::text), true),
                                     '{attempts}', to_jsonb(attempts + 1), true),
                    updated_at = now()
                WHERE module = ? AND tenant_id = ? AND event_id = ?
                """, statement -> {
            statement.setInt(1, maxAttempts);
            statement.setString(2, error);
            statement.setString(3, module);
            statement.setString(4, tenantId);
            statement.setString(5, eventId);
            return null;
        }));
    }

    public void addAuditLog(AuditLog log) {
        scoped(log.tenantId(), connection -> execute(connection, """
                INSERT INTO module_audit_log (module, log_id, tenant_id, data, occurred_at)
                VALUES (?, ?, ?, ?::jsonb, COALESCE(?::timestamptz, now()))
                ON CONFLICT (module, log_id) DO NOTHING
                """, statement -> {
            statement.setString(1, module);
            statement.setString(2, log.id());
            statement.setString(3, log.tenantId());
            statement.setString(4, write(log));
            statement.setString(5, log.occurredAt());
            return null;
        }));
    }

    public Optional<IdempotencyRecord> idempotency(String tenantId, String commandType, String key) {
        return scoped(tenantId, connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT data FROM module_idempotency_record WHERE module = ? AND tenant_id = ? AND command_type = ? AND idempotency_key = ?"
            )) {
                statement.setString(1, module);
                statement.setString(2, tenantId);
                statement.setString(3, commandType);
                statement.setString(4, key);
                try (ResultSet resultSet = statement.executeQuery()) {
                    return resultSet.next() ? Optional.of(read(resultSet.getString(1), IdempotencyRecord.class)) : Optional.<IdempotencyRecord>empty();
                }
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });
    }

    public void saveIdempotency(
            String tenantId, String commandType, String key, String requestHash,
            int statusCode, Object body
    ) {
        scoped(tenantId, connection -> execute(connection, """
                INSERT INTO module_idempotency_record (module, tenant_id, command_type, idempotency_key, data)
                VALUES (?, ?, ?, ?, ?::jsonb)
                ON CONFLICT (module, tenant_id, command_type, idempotency_key)
                DO UPDATE SET data = EXCLUDED.data
                """, statement -> {
            statement.setString(1, module);
            statement.setString(2, tenantId);
            statement.setString(3, commandType);
            statement.setString(4, key);
            statement.setString(5, write(new IdempotencyRecord(requestHash, statusCode, body)));
            return null;
        }));
    }

    protected <T> T scoped(String tenantId, Function<Connection, T> work) {
        Connection active = transactionConnection.get();
        if (active != null) {
            String bound = transactionTenant.get();
            if (bound == null) {
                bindTenant(active, tenantId);
                transactionTenant.set(tenantId);
            } else if (!bound.equals(tenantId)) {
                throw new IllegalStateException("Cross-tenant transaction is not allowed");
            }
            return work.apply(active);
        }
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            bindTenant(connection, tenantId);
            try {
                T result = work.apply(connection);
                connection.commit();
                return result;
            } catch (Exception exception) {
                connection.rollback();
                throw exception instanceof RuntimeException runtime ? runtime : new IllegalStateException(exception);
            }
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private void bindTenant(Connection connection, String tenantId) {
        execute(connection, "SELECT set_config('app.tenant_id', ?, true)", statement -> {
            statement.setString(1, tenantId);
            return null;
        });
    }

    private <T> T execute(Connection connection, String sql, SqlFunction<PreparedStatement, T> binder) {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            T result = binder.apply(statement);
            statement.execute();
            return result;
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    protected <T> T read(String json, Class<T> type) {
        try {
            return objectMapper.readValue(json, type);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    protected String write(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    public void close() {
    }

    @FunctionalInterface
    protected interface SqlFunction<T, R> {
        R apply(T value) throws Exception;
    }
}
