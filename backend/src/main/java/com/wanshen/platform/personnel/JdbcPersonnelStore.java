package com.wanshen.platform.personnel;

import com.fasterxml.jackson.databind.ObjectMapper;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Supplier;

public class JdbcPersonnelStore extends AbstractPersonnelStore implements AutoCloseable {
    private static final String MODULE = "personnel";

    private final DataSource dataSource;
    private final ObjectMapper objectMapper;
    private final ThreadLocal<Connection> transactionConnection = new ThreadLocal<>();
    private final ThreadLocal<String> transactionTenant = new ThreadLocal<>();

    public JdbcPersonnelStore(DataSource dataSource, ObjectMapper objectMapper) {
        this.dataSource = dataSource;
        this.objectMapper = objectMapper;
    }

    @Override
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
        } catch (Exception exception) {
            throw new IllegalStateException("Personnel transaction failed", exception);
        }
    }

    @Override
    public Page<Employee> employees(
            String tenantId, Integer page, Integer pageSize, String status,
            String department, String search
    ) {
        List<Employee> values = scoped(tenantId, connection -> {
            List<Employee> result = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT data FROM module_document WHERE module = ? AND tenant_id = ? AND kind = ?"
            )) {
                statement.setString(1, MODULE);
                statement.setString(2, tenantId);
                statement.setString(3, "employee");
                try (ResultSet resultSet = statement.executeQuery()) {
                    while (resultSet.next()) result.add(read(resultSet.getString(1), Employee.class));
                }
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
            return result;
        }).stream()
                .filter(item -> status == null || item.status().equals(status))
                .filter(item -> department == null || item.department().equals(department))
                .filter(item -> search == null || search.isBlank() || contains(search, item.employeeNo(), item.name(), item.department(), item.phone(), item.email()))
                .sorted((left, right) -> right.createdAt().compareTo(left.createdAt()))
                .toList();
        return page(values, page, pageSize);
    }

    @Override
    public Optional<Employee> employee(String tenantId, String id) {
        return document(tenantId, "employee", id, Employee.class);
    }

    @Override
    public Optional<Employee> employeeByNo(String tenantId, String employeeNo) {
        return employees(tenantId, 1, 10000, null, null, null).items().stream()
                .filter(item -> item.employeeNo().equals(employeeNo))
                .findFirst();
    }

    @Override
    public void saveEmployee(Employee value) {
        putDocument(value.tenantId(), "employee", value.id(), value);
    }

    @Override
    public void deleteEmployee(String tenantId, String id) {
        deleteDocument(tenantId, "employee", id);
    }

    @Override
    public Page<Attendance> attendances(
            String tenantId, Integer page, Integer pageSize, String status, String shift,
            String employeeId, String recordDate, String search
    ) {
        List<Attendance> values = scoped(tenantId, connection -> {
            List<Attendance> result = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT data FROM module_document WHERE module = ? AND tenant_id = ? AND kind = ?"
            )) {
                statement.setString(1, MODULE);
                statement.setString(2, tenantId);
                statement.setString(3, "attendance");
                try (ResultSet resultSet = statement.executeQuery()) {
                    while (resultSet.next()) result.add(read(resultSet.getString(1), Attendance.class));
                }
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
            return result;
        }).stream()
                .filter(item -> status == null || item.status().equals(status))
                .filter(item -> shift == null || item.shift().equals(shift))
                .filter(item -> employeeId == null || item.employeeId().equals(employeeId))
                .filter(item -> recordDate == null || item.recordDate().equals(recordDate))
                .filter(item -> search == null || search.isBlank() || contains(search, item.recordNo(), item.employeeName(), item.recordDate()))
                .sorted((left, right) -> right.createdAt().compareTo(left.createdAt()))
                .toList();
        return page(values, page, pageSize);
    }

    @Override
    public Optional<Attendance> attendance(String tenantId, String id) {
        return document(tenantId, "attendance", id, Attendance.class);
    }

    @Override
    public void saveAttendance(Attendance value) {
        putDocument(value.tenantId(), "attendance", value.id(), value);
    }

    @Override
    public Page<Skill> skills(
            String tenantId, Integer page, Integer pageSize, String status, String level,
            String employeeId, String search
    ) {
        List<Skill> values = scoped(tenantId, connection -> {
            List<Skill> result = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT data FROM module_document WHERE module = ? AND tenant_id = ? AND kind = ?"
            )) {
                statement.setString(1, MODULE);
                statement.setString(2, tenantId);
                statement.setString(3, "skill");
                try (ResultSet resultSet = statement.executeQuery()) {
                    while (resultSet.next()) result.add(read(resultSet.getString(1), Skill.class));
                }
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
            return result;
        }).stream()
                .filter(item -> status == null || item.status().equals(status))
                .filter(item -> level == null || item.level().equals(level))
                .filter(item -> employeeId == null || item.employeeId().equals(employeeId))
                .filter(item -> search == null || search.isBlank() || contains(search, item.certNo(), item.employeeName(), item.skillName(), item.issuer()))
                .sorted((left, right) -> right.createdAt().compareTo(left.createdAt()))
                .toList();
        return page(values, page, pageSize);
    }

    @Override
    public Optional<Skill> skill(String tenantId, String id) {
        return document(tenantId, "skill", id, Skill.class);
    }

    @Override
    public void saveSkill(Skill value) {
        putDocument(value.tenantId(), "skill", value.id(), value);
    }

    @Override
    public void deleteSkill(String tenantId, String id) {
        deleteDocument(tenantId, "skill", id);
    }

    @Override
    public void addOutbox(OutboxEvent event) {
        scoped(event.tenantId(), connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    """
                    INSERT INTO module_outbox_event (module, tenant_id, event_id, status, attempts, data)
                    VALUES (?, ?, ?, ?, ?, ?::jsonb)
                    ON CONFLICT (module, tenant_id, event_id)
                    DO UPDATE SET data = EXCLUDED.data, status = EXCLUDED.status,
                                  attempts = EXCLUDED.attempts, updated_at = now()
                    """
            )) {
                statement.setString(1, MODULE);
                statement.setString(2, event.tenantId());
                statement.setString(3, event.eventId());
                statement.setString(4, event.status());
                statement.setInt(5, event.attempts());
                statement.setString(6, write(event));
                statement.executeUpdate();
                return null;
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });
    }

    @Override
    public List<OutboxEvent> pendingOutbox(String tenantId) {
        return scoped(tenantId, connection -> {
            List<OutboxEvent> result = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    """
                    SELECT data FROM module_outbox_event
                    WHERE module = ? AND tenant_id = ? AND status = 'PENDING'
                    ORDER BY created_at
                    """
            )) {
                statement.setString(1, MODULE);
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

    @Override
    public List<String> pendingOutboxTenantIds() {
        return scoped("infra", connection -> {
            List<String> result = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT DISTINCT tenant_id FROM module_outbox_event WHERE module = ? AND status = 'PENDING' ORDER BY tenant_id"
            )) {
                statement.setString(1, MODULE);
                try (ResultSet resultSet = statement.executeQuery()) {
                    while (resultSet.next()) result.add(resultSet.getString(1));
                }
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
            return result;
        });
    }

    @Override
    public void markOutboxPublished(String tenantId, String eventId) {
        scoped(tenantId, connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    """
                    UPDATE module_outbox_event
                    SET status = 'PUBLISHED', updated_at = now()
                    WHERE module = ? AND tenant_id = ? AND event_id = ?
                    """
            )) {
                statement.setString(1, MODULE);
                statement.setString(2, tenantId);
                statement.setString(3, eventId);
                statement.executeUpdate();
                return null;
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });
    }

    @Override
    public void markOutboxFailed(String tenantId, String eventId, String error, int maxAttempts) {
        scoped(tenantId, connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    """
                    UPDATE module_outbox_event
                    SET attempts = attempts + 1,
                        status = CASE WHEN attempts + 1 >= ? THEN 'DEAD_LETTER' ELSE 'PENDING' END,
                        data = jsonb_set(jsonb_set(data, '{lastError}', to_jsonb(?::text), true),
                                         '{attempts}', to_jsonb(attempts + 1), true),
                        updated_at = now()
                    WHERE module = ? AND tenant_id = ? AND event_id = ?
                    """
            )) {
                statement.setInt(1, maxAttempts);
                statement.setString(2, error);
                statement.setString(3, MODULE);
                statement.setString(4, tenantId);
                statement.setString(5, eventId);
                statement.executeUpdate();
                return null;
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });
    }

    @Override
    public void addAuditLog(AuditLog log) {
        scoped(log.tenantId(), connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    """
                    INSERT INTO module_audit_log (module, log_id, tenant_id, data, occurred_at)
                    VALUES (?, ?, ?, ?::jsonb, COALESCE(?::timestamptz, now()))
                    ON CONFLICT (module, log_id) DO NOTHING
                    """
            )) {
                statement.setString(1, MODULE);
                statement.setString(2, log.id());
                statement.setString(3, log.tenantId());
                statement.setString(4, write(log));
                statement.setString(5, log.occurredAt());
                statement.executeUpdate();
                return null;
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });
    }

    @Override
    public Optional<IdempotencyRecord> idempotency(String tenantId, String commandType, String key) {
        return scoped(tenantId, connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    """
                    SELECT data FROM module_idempotency_record
                    WHERE module = ? AND tenant_id = ? AND command_type = ? AND idempotency_key = ?
                    """
            )) {
                statement.setString(1, MODULE);
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

    @Override
    public void saveIdempotency(
            String tenantId, String commandType, String key, String requestHash,
            int statusCode, Object body
    ) {
        scoped(tenantId, connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    """
                    INSERT INTO module_idempotency_record
                      (module, tenant_id, command_type, idempotency_key, data)
                    VALUES (?, ?, ?, ?, ?::jsonb)
                    ON CONFLICT (module, tenant_id, command_type, idempotency_key)
                    DO UPDATE SET data = EXCLUDED.data
                    """
            )) {
                statement.setString(1, MODULE);
                statement.setString(2, tenantId);
                statement.setString(3, commandType);
                statement.setString(4, key);
                statement.setString(5, write(new IdempotencyRecord(requestHash, statusCode, body)));
                statement.executeUpdate();
                return null;
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });
    }

    private <T> Optional<T> document(String tenantId, String kind, String id, Class<T> type) {
        return scoped(tenantId, connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT data FROM module_document WHERE module = ? AND tenant_id = ? AND kind = ? AND doc_id = ?"
            )) {
                statement.setString(1, MODULE);
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

    private void putDocument(String tenantId, String kind, String id, Object value) {
        scoped(tenantId, connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    """
                    INSERT INTO module_document (module, tenant_id, kind, doc_id, data)
                    VALUES (?, ?, ?, ?, ?::jsonb)
                    ON CONFLICT (module, tenant_id, kind, doc_id)
                    DO UPDATE SET data = EXCLUDED.data, updated_at = now()
                    """
            )) {
                statement.setString(1, MODULE);
                statement.setString(2, tenantId);
                statement.setString(3, kind);
                statement.setString(4, id);
                statement.setString(5, write(value));
                statement.executeUpdate();
                return null;
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });
    }

    private void deleteDocument(String tenantId, String kind, String id) {
        scoped(tenantId, connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    "DELETE FROM module_document WHERE module = ? AND tenant_id = ? AND kind = ? AND doc_id = ?"
            )) {
                statement.setString(1, MODULE);
                statement.setString(2, tenantId);
                statement.setString(3, kind);
                statement.setString(4, id);
                statement.executeUpdate();
                return null;
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });
    }

    private <T> T scoped(String tenantId, Function<Connection, T> work) {
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
        } catch (Exception exception) {
            throw exception instanceof RuntimeException runtime ? runtime : new IllegalStateException(exception);
        }
    }

    private void bindTenant(Connection connection, String tenantId) {
        try (PreparedStatement statement = connection.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
            statement.setString(1, tenantId);
            statement.executeQuery();
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private <T> Page<T> page(List<T> values, Integer page, Integer pageSize) {
        int safePage = page == null || page < 1 ? 1 : page;
        int safeSize = pageSize == null || pageSize < 1 ? 20 : pageSize;
        int from = Math.min((safePage - 1) * safeSize, values.size());
        int to = Math.min(from + safeSize, values.size());
        return new Page<>(List.copyOf(values.subList(from, to)), values.size());
    }

    private boolean contains(String query, String... fields) {
        for (String field : fields) {
            if (field != null && field.toLowerCase().contains(query.toLowerCase())) return true;
        }
        return false;
    }

    private <T> T read(String json, Class<T> type) {
        try {
            return objectMapper.readValue(json, type);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private String write(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    public void close() {
    }
}
