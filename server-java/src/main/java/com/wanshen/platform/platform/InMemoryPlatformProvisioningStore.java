package com.wanshen.platform.platform;

import java.util.Map;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.ArrayList;
import java.util.concurrent.ConcurrentHashMap;

public class InMemoryPlatformProvisioningStore implements PlatformProvisioningStore {
    private final Set<String> tenants = ConcurrentHashMap.newKeySet();
    private final Map<String, Map<String, Object>> documents = new HashMap<>();

    @Override
    public boolean tenantExists(String tenantId) { return tenants.contains(tenantId); }

    @Override
    public void save(String kind, String id, Map<String, Object> document) {
        if ("tenant".equals(kind)) tenants.add(id);
        String owner = "tenant".equals(kind) ? id : document.get("tenantId").toString();
        documents.put(key(owner, kind, id), new HashMap<>(document));
    }

    @Override
    public List<Map<String, Object>> list(String tenantId, String kind) {
        synchronized (documents) {
            return documents.keySet().stream()
                    .filter(key -> key.startsWith(tenantId + ":" + kind + ":"))
                    .map(key -> new HashMap<>(documents.get(key)))
                    .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        }
    }

    @Override
    public Optional<Map<String, Object>> get(String tenantId, String kind, String id) {
        synchronized (documents) {
            Map<String, Object> value = documents.get(key(tenantId, kind, id));
            return value == null ? Optional.empty() : Optional.of(new HashMap<>(value));
        }
    }

    @Override
    public void delete(String tenantId, String kind, String id) {
        synchronized (documents) { documents.remove(key(tenantId, kind, id)); }
    }

    @Override
    public void addAuditLog(Map<String, Object> log) {
        save("auditLog", log.get("id").toString(), log);
    }

    private String key(String tenantId, String kind, String id) {
        return tenantId + ":" + kind + ":" + id;
    }
}
