package com.wanshen.platform.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.storage.JdbcModuleStoreSupport;

import javax.sql.DataSource;
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
    }

    @Override
    public List<Map<String, Object>> list(String tenantId, String kind) {
        return (List<Map<String, Object>>) (List<?>) documents(tenantId, kind, Map.class);
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<Map<String, Object>> get(String tenantId, String kind, String id) {
        return (Optional<Map<String, Object>>) (Optional<?>) document(tenantId, kind, id, Map.class);
    }

    @Override
    public void delete(String tenantId, String kind, String id) {
        deleteDocument(tenantId, kind, id);
    }

    @Override
    public void addAuditLog(Map<String, Object> log) {
        save("auditLog", log.get("id").toString(), log);
    }

    @Override
    public <T> T transaction(Supplier<T> work) { return super.transaction(work); }
}
