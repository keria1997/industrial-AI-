package com.wanshen.platform.platform;

import java.util.Map;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

public interface PlatformProvisioningStore {
    boolean tenantExists(String tenantId);
    void save(String kind, String id, Map<String, Object> document);
    List<Map<String, Object>> list(String tenantId, String kind);
    Optional<Map<String, Object>> get(String tenantId, String kind, String id);
    void delete(String tenantId, String kind, String id);
    void addAuditLog(Map<String, Object> log);

    default boolean isSessionRevoked(String tenantId, String account) {
        return list(tenantId, "sessionRevocation").stream()
                .anyMatch(value -> account.equals(value.get("account")));
    }

    default void revokeSession(String tenantId, String account) {
        String timestamp = java.time.Instant.now().toString();
        Map<String, Object> value = new java.util.LinkedHashMap<>();
        value.put("tenantId", tenantId); value.put("account", account); value.put("jti", "-");
        value.put("revokedAt", timestamp); value.put("revokedBy", account); value.put("reason", "logout");
        value.put("expiresAt", java.time.Instant.now().plusSeconds(8 * 3600).toString());
        save("sessionRevocation", account + ":-", value);
    }
    default <T> T transaction(Supplier<T> work) { return work.get(); }
}
