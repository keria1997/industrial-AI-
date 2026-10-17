package com.wanshen.platform.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.storage.JdbcModuleStoreSupport;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

public class JdbcPlatformProvisioningStore extends JdbcModuleStoreSupport implements PlatformProvisioningStore {
    public JdbcPlatformProvisioningStore(DataSource dataSource, ObjectMapper objectMapper) {
        super(dataSource, objectMapper, "platform");
    }

    @Override
    public boolean tenantExists(String tenantId) {
        return get(tenantId, "tenant", tenantId).isPresent();
    }

    @Override
    public void save(String kind, String id, Map<String, Object> document) {
        String tenantId = "tenant".equals(kind) ? id : document.get("tenantId").toString();
        putDocument(tenantId, kind, id, document);
        if ("tenant".equals(kind)) upsertTenantRecord(id, document);
        if ("orgUnit".equals(kind)) upsertOrgUnitRecord(tenantId, id, document);
    }

    @Override
    public List<Map<String, Object>> list(String tenantId, String kind) {
        if ("orgUnit".equals(kind)) return listOrgUnitRecords(tenantId);
        return (List<Map<String, Object>>) (List<?>) documents(tenantId, kind, Map.class);
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<Map<String, Object>> get(String tenantId, String kind, String id) {
        if ("orgUnit".equals(kind)) return getOrgUnitRecord(tenantId, id);
        return (Optional<Map<String, Object>>) (Optional<?>) document(tenantId, kind, id, Map.class);
    }

    @Override
    public void delete(String tenantId, String kind, String id) {
        if ("orgUnit".equals(kind)) deleteOrgUnitRecord(tenantId, id);
        deleteDocument(tenantId, kind, id);
    }

    @Override
    public void addAuditLog(Map<String, Object> log) {
        save("auditLog", log.get("id").toString(), log);
    }

    @Override
    public <T> T transaction(Supplier<T> work) { return super.transaction(work); }

    private void upsertTenantRecord(String sourceId, Map<String, Object> document) {
        executeTenantWrite(sourceId, """
                INSERT INTO iam_tenant (
                  source_id, code, name, edition, status, bootstrap_owner_account_id,
                  formal_admin_account_id, expire_at, row_version, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, now()), now())
                ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO UPDATE SET
                  code = EXCLUDED.code,
                  name = EXCLUDED.name,
                  edition = EXCLUDED.edition,
                  status = EXCLUDED.status,
                  bootstrap_owner_account_id = EXCLUDED.bootstrap_owner_account_id,
                  formal_admin_account_id = EXCLUDED.formal_admin_account_id,
                  expire_at = EXCLUDED.expire_at,
                  row_version = EXCLUDED.row_version,
                  updated_at = now()
                """, statement -> {
            statement.setString(1, sourceId);
            statement.setString(2, text(document, "code", sourceId));
            statement.setString(3, text(document, "name", sourceId));
            statement.setString(4, text(document, "edition", "standard"));
            statement.setString(5, text(document, "status", "running"));
            statement.setString(6, nullable(document, "bootstrapOwnerAccountId"));
            statement.setString(7, nullable(document, "formalAdminAccountId"));
            statement.setTimestamp(8, timestamp(document, "expireAt"));
            statement.setLong(9, longValue(document, "version", 1));
            statement.setTimestamp(10, timestamp(document, "createdAt"));
        });
    }

    private void upsertOrgUnitRecord(String tenantId, String sourceId, Map<String, Object> document) {
        executeTenantWrite(tenantId, """
                WITH tenant AS (
                  SELECT id FROM iam_tenant WHERE source_id = ?::text
                  ORDER BY created_at LIMIT 1
                )
                INSERT INTO iam_org_unit (
                  tenant_id, source_id, code, name, type, parent_id, manager_employee_id,
                  status, sort_order, row_version, created_at, updated_at, api_snapshot,
                  source_parent_id, source_manager_employee_id
                )
                SELECT
                  tenant.id, ?::text, ?::text, ?::text, ?::text,
                  (SELECT parent.id FROM iam_org_unit AS parent
                    WHERE parent.tenant_id = tenant.id AND parent.source_id = ?::text),
                  (SELECT manager.id FROM iam_employee AS manager
                    WHERE manager.tenant_id = tenant.id AND manager.id::text = ?::text),
                  ?::text, ?::int, ?::bigint, COALESCE(?::timestamptz, now()), now(), ?::jsonb,
                  ?::text, ?::text
                FROM tenant
                ON CONFLICT (tenant_id, source_id) DO UPDATE SET
                  code = EXCLUDED.code,
                  name = EXCLUDED.name,
                  type = EXCLUDED.type,
                  parent_id = EXCLUDED.parent_id,
                  manager_employee_id = EXCLUDED.manager_employee_id,
                  status = EXCLUDED.status,
                  sort_order = EXCLUDED.sort_order,
                  row_version = EXCLUDED.row_version,
                  api_snapshot = EXCLUDED.api_snapshot,
                  source_parent_id = EXCLUDED.source_parent_id,
                  source_manager_employee_id = EXCLUDED.source_manager_employee_id,
                  updated_at = now()
                """, statement -> {
            statement.setString(1, tenantId);
            statement.setString(2, sourceId);
            statement.setString(3, text(document, "code", sourceId));
            statement.setString(4, text(document, "name", sourceId));
            statement.setString(5, text(document, "type", "department"));
            statement.setString(6, nullable(document, "parentId"));
            statement.setString(7, nullable(document, "managerEmployeeId"));
            statement.setString(8, text(document, "status", "enabled"));
            statement.setInt(9, (int) longValue(document, "sortOrder", 0));
            statement.setLong(10, longValue(document, "version", 1));
            statement.setTimestamp(11, timestamp(document, "createdAt"));
            statement.setString(12, writeJson(document));
            statement.setString(13, nullable(document, "parentId"));
            statement.setString(14, nullable(document, "managerEmployeeId"));
            statement.setString(13, nullable(document, "parentId"));
            statement.setString(14, nullable(document, "managerEmployeeId"));
        });
    }

    private List<Map<String, Object>> listOrgUnitRecords(String tenantId) {
        return scoped(tenantId, connection -> {
            bindStructuredTenant(connection, tenantId);
            try (PreparedStatement statement = connection.prepareStatement("""
                    SELECT source_id, code, name, type, source_parent_id,
                           source_manager_employee_id, status, row_version,
                           created_at, updated_at, api_snapshot
                    FROM iam_org_unit
                    WHERE tenant_id = current_setting('app.tenant_id', true)
                    ORDER BY sort_order, code, source_id
                    """)) {
                return readOrgUnits(statement);
            } catch (SQLException exception) {
                throw new IllegalStateException("Unable to list platform organization units", exception);
            }
        });
    }

    private Optional<Map<String, Object>> getOrgUnitRecord(String tenantId, String sourceId) {
        return scoped(tenantId, connection -> {
            bindStructuredTenant(connection, tenantId);
            try (PreparedStatement statement = connection.prepareStatement("""
                    SELECT source_id, code, name, type, source_parent_id,
                           source_manager_employee_id, status, row_version,
                           created_at, updated_at, api_snapshot
                    FROM iam_org_unit
                    WHERE tenant_id = current_setting('app.tenant_id', true) AND source_id = ?
                    """)) {
                statement.setString(1, sourceId);
                return readOrgUnits(statement).stream().findFirst();
            } catch (SQLException exception) {
                throw new IllegalStateException("Unable to read platform organization unit", exception);
            }
        });
    }

    private List<Map<String, Object>> readOrgUnits(PreparedStatement statement) throws SQLException {
        List<Map<String, Object>> result = new java.util.ArrayList<>();
        try (ResultSet rows = statement.executeQuery()) {
            while (rows.next()) {
                Map<String, Object> value = new java.util.LinkedHashMap<>();
                value.put("id", rows.getString("source_id"));
                value.put("code", rows.getString("code"));
                value.put("name", rows.getString("name"));
                value.put("type", rows.getString("type"));
                value.put("parentId", rows.getString("source_parent_id"));
                value.put("managerEmployeeId", rows.getString("source_manager_employee_id"));
                value.put("status", rows.getString("status"));
                value.put("version", rows.getLong("row_version"));
                value.put("createdAt", instantText(rows.getTimestamp("created_at")));
                value.put("updatedAt", instantText(rows.getTimestamp("updated_at")));
                String snapshot = rows.getString("api_snapshot");
                if (snapshot != null) {
                    Map<String, Object> extras = readJson(snapshot);
                    for (String field : List.of("managerName", "description", "employeeCount")) {
                        if (extras.containsKey(field)) value.putIfAbsent(field, extras.get(field));
                    }
                }
                result.add(value);
            }
        }
        return result;
    }

    private void deleteOrgUnitRecord(String tenantId, String sourceId) {
        executeTenantWrite(tenantId, "DELETE FROM iam_org_unit WHERE tenant_id = current_setting('app.tenant_id', true) AND source_id = ?",
                statement -> {
                    statement.setString(1, sourceId);
                });
    }

    private void executeTenantWrite(String tenantId, String sql, SqlBinder binder) {
        scoped(tenantId, connection -> {
            bindStructuredTenant(connection, tenantId);
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                binder.bind(statement);
                statement.executeUpdate();
                return null;
            } catch (SQLException exception) {
                throw new IllegalStateException("Unable to persist structured platform data", exception);
            }
        });
    }

    private void bindStructuredTenant(Connection connection, String sourceTenantId) {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT set_config(
                  'app.tenant_id',
                  COALESCE((SELECT id::text FROM iam_tenant WHERE source_id = ?::text), ?),
                  true
                )
                """)) {
            statement.setString(1, sourceTenantId);
            statement.setString(2, sourceTenantId);
            statement.execute();
        } catch (SQLException exception) {
            throw new IllegalStateException("Unable to bind structured organization tenant", exception);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper().writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to serialize platform organization snapshot", exception);
        }
    }

    private Map<String, Object> readJson(String value) {
        try {
            return objectMapper().readValue(value, objectMapper().getTypeFactory()
                    .constructMapType(java.util.LinkedHashMap.class, String.class, Object.class));
        } catch (Exception exception) {
            return Map.of();
        }
    }

    private String text(Map<String, Object> value, String field, String fallback) {
        Object item = value.get(field);
        return item == null || String.valueOf(item).isBlank() ? fallback : String.valueOf(item);
    }

    private String nullable(Map<String, Object> value, String field) {
        Object item = value.get(field);
        return item == null || String.valueOf(item).isBlank() ? null : String.valueOf(item);
    }

    private long longValue(Map<String, Object> value, String field, long fallback) {
        try {
            return Long.parseLong(String.valueOf(value.getOrDefault(field, fallback)));
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }

    private Timestamp timestamp(Map<String, Object> value, String field) {
        Object item = value.get(field);
        if (item == null || String.valueOf(item).isBlank()) return null;
        try {
            return Timestamp.from(Instant.parse(String.valueOf(item)));
        } catch (DateTimeParseException exception) {
            try {
                return Timestamp.valueOf(LocalDateTime.parse(String.valueOf(item)));
            } catch (DateTimeParseException ignored) {
                return null;
            }
        }
    }

    private String instantText(java.util.Date value) {
        return value == null ? null : value.toInstant().toString();
    }

    interface SqlBinder {
        void bind(PreparedStatement statement) throws SQLException;
    }
}
