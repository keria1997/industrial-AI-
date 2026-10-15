package com.wanshen.platform.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class TokenServiceTests {
    private final TokenService tokenService = new TokenService("test-secret", new ObjectMapper());

    @Test
    void issuesAndVerifiesCompatibleHs256Tokens() {
        TokenService.IssuedToken issued = tokenService.issue(
                "admin", "系统管理员", "超级管理员",
                java.util.List.of("TENANT-SHWS"), java.util.List.of("*"),
                "development-session-v1"
        );

        TokenService.Claims claims = tokenService.verify(issued.accessToken());
        assertEquals("admin", claims.sub());
        assertEquals("TENANT-SHWS", claims.tenantIds().get(0));
        assertEquals("industrial-ai-platform", claims.iss());
    }

    @Test
    void rejectsTamperedTokens() {
        TokenService.IssuedToken issued = tokenService.issue(
                "admin", "系统管理员", "超级管理员",
                java.util.List.of("TENANT-SHWS"), java.util.List.of("*"),
                "development-session-v1"
        );

        assertThrows(TokenService.InvalidTokenException.class,
                () -> tokenService.verify(issued.accessToken() + "x"));
    }
}
