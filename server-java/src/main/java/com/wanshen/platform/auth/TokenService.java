package com.wanshen.platform.auth;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

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
        long issuedAt = Instant.now().getEpochSecond();
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
            Claims claims = objectMapper.readValue(
                    Base64.getUrlDecoder().decode(parts[1]), Claims.class);
            if (!ISSUER.equals(claims.iss())
                    || claims.sub() == null
                    || claims.tenantIds() == null
                    || claims.tenantIds().isEmpty()
                    || claims.exp() <= Instant.now().getEpochSecond()
            ) {
                throw new InvalidTokenException();
            }
            return claims;
        } catch (InvalidTokenException exception) {
            throw exception;
        } catch (Exception exception) {
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
            String iss
    ) {}

    public static class InvalidTokenException extends RuntimeException {}
}
