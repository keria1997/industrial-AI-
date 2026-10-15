package com.wanshen.platform.auth;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class TokenService {
    private static final String ISSUER = "industrial-ai-platform";

    private final String secret;
    private final ObjectMapper objectMapper;
    private RegisteredUserStore users;
    private boolean demoEnabled;
    private List<String> demoAccounts = List.of();

    @Autowired
    public void configureIdentity(RegisteredUserStore users,
            @Value("${app.auth.demo-enabled}") boolean demoEnabled,
            @Value("${app.auth.demo-accounts}") String demoAccounts) {
        this.users = users;
        this.demoEnabled = demoEnabled;
        this.demoAccounts = java.util.Arrays.stream(demoAccounts.split(",")).map(String::trim).toList();
    }

    public TokenService(
            @Value("${app.auth.secret}") String secret,
            ObjectMapper objectMapper
    ) {
        this.secret = secret;
        this.objectMapper = objectMapper;
    }

    public IssuedToken issue(
            String account,
            String name,
            String role,
            List<String> tenantIds,
            List<String> permissions,
            String permissionVersion
    ) {
        Instant issueTime = Instant.now();
        long issuedAt = issueTime.getEpochSecond();
        long expiresAt = issuedAt + 8 * 60 * 60;

        Map<String, Object> header = new LinkedHashMap<>();
        header.put("alg", "HS256");
        header.put("typ", "JWT");

        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("sub", account);
        claims.put("name", name);
        claims.put("role", role);
        claims.put("tenantIds", tenantIds);
        claims.put("permissions", permissions);
        claims.put("permissionVersion", permissionVersion);
        claims.put("iat", issuedAt);
        claims.put("exp", expiresAt);
        claims.put("iss", ISSUER);
        claims.put("jti", java.util.UUID.randomUUID().toString());
        claims.put("sessionVersion", users == null ? 0
                : users.findByAccount(account).map(RegisteredUser::sessionVersion).orElse(0L));
        claims.put("issuedAt", issueTime.toString());

        try {
            String unsigned = encodeJson(header) + "." + encodeJson(claims);
            String accessToken = unsigned + "." + sign(unsigned);
            String expires = Instant.ofEpochSecond(expiresAt).toString();
            return new IssuedToken(accessToken, expires);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Unable to serialize session claims", exception);
        }
    }

    public Claims verify(String token) {
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            throw new InvalidTokenException();
        }

        String unsigned = parts[0] + "." + parts[1];
        byte[] expected = sign(unsigned).getBytes(StandardCharsets.US_ASCII);
        byte[] actual = parts[2].getBytes(StandardCharsets.US_ASCII);
        if (!MessageDigest.isEqual(expected, actual)) {
            throw new InvalidTokenException();
        }

        try {
            var header = objectMapper.readTree(Base64.getUrlDecoder().decode(parts[0]));
            if (!"HS256".equals(header.path("alg").asText()) || !"JWT".equals(header.path("typ").asText())) {
                throw new InvalidTokenException();
            }
            Claims claims = objectMapper.readValue(
                    Base64.getUrlDecoder().decode(parts[1]), Claims.class);
            if (!ISSUER.equals(claims.iss())
                    || claims.sub() == null
                    || claims.tenantIds() == null
                    || claims.tenantIds().isEmpty()
                    || claims.tenantIds().stream().anyMatch(value -> value == null || value.isBlank())
                    || claims.jti() == null || claims.jti().isBlank()
                    || claims.iat() > Instant.now().getEpochSecond() + 30
                    || claims.exp() <= Instant.now().getEpochSecond()
                    || claims.exp() <= claims.iat()
            ) {
                throw new InvalidTokenException();
            }
            if (users != null) {
                if (users.isSessionConsumed(claims.jti())) throw new InvalidTokenException();
                RegisteredUser user = users.findByAccount(claims.sub()).orElse(null);
                if (user != null) {
                    if (!"active".equals(user.status()) || user.firstLogin()
                            || user.sessionVersion() != claims.sessionVersion()
                            || !claims.tenantIds().equals(List.of(user.tenantId()))) throw new InvalidTokenException();
                    return new Claims(user.account(), user.name(), user.role(), List.of(user.tenantId()),
                            user.permissions(), claims.permissionVersion(), claims.iat(), claims.exp(), claims.iss(),
                            claims.jti(), claims.sessionVersion(), claims.issuedAt());
                }
                if (!demoEnabled || !demoAccounts.contains(claims.sub())
                        || !List.of("TENANT-SHWS", "TENANT-HDJG").containsAll(claims.tenantIds())) {
                    throw new InvalidTokenException();
                }
            }
            return claims;
        } catch (InvalidTokenException exception) {
            throw exception;
        } catch (java.io.IOException | IllegalArgumentException exception) {
            throw new InvalidTokenException();
        }
    }

    private String sign(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException | InvalidKeyException exception) {
            throw new IllegalStateException("Unable to sign session token", exception);
        }
    }

    private String encodeJson(Object value) throws JsonProcessingException {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(objectMapper.writeValueAsBytes(value));
    }

    public record IssuedToken(String accessToken, String expiresAt) {}

    public record Claims(
            String sub,
            String name,
            String role,
            List<String> tenantIds,
            List<String> permissions,
            String permissionVersion,
            long iat,
            long exp,
            String iss,
            String jti,
            long sessionVersion,
            String issuedAt
    ) {}

    public static class InvalidTokenException extends RuntimeException {}
}
