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

    default boolean isSessionRevoked(String tenantId, com.wanshen.platform.auth.TokenService.Claims claims) {
        return list(tenantId, "sessionRevocation").stream().anyMatch(value -> {
            if (!claims.sub().equals(value.get("account"))) return false;
            try {
                Object expiry = value.get("expiresAt");
                if (expiry != null && !java.time.Instant.parse(expiry.toString()).isAfter(java.time.Instant.now())) return false;
                String jti = String.valueOf(value.getOrDefault("jti", "-"));
                if (!"-".equals(jti) && !"null".equals(jti) && !jti.isBlank()) return jti.equals(claims.jti());
                java.time.Instant issuedAt = claims.issuedAt() == null
                        ? java.time.Instant.ofEpochSecond(claims.iat()) : java.time.Instant.parse(claims.issuedAt());
                return !issuedAt.isAfter(java.time.Instant.parse(value.get("revokedAt").toString()));
            } catch (RuntimeException exception) {
                // A malformed security record must not reopen an existing session.
                return true;
            }
        });
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
