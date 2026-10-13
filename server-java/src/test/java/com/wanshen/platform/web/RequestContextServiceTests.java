package com.wanshen.platform.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.platform.InMemoryPlatformProvisioningStore;
import com.wanshen.platform.auth.TokenService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RequestContextServiceTests {
    @Test
    void rejectsBusinessRequestsAfterSessionRevocation() {
        TokenService tokens = new TokenService("test-secret", new ObjectMapper());
        InMemoryPlatformProvisioningStore store = new InMemoryPlatformProvisioningStore();
        RequestContextService contexts = new RequestContextService(tokens, store);
        String token = tokens.issue("admin", "管理员", "超级管理员", List.of("TENANT-SHWS"), List.of("*"), "test").accessToken();

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + token);
        request.addHeader("X-Tenant-Id", "TENANT-SHWS");
        assertDoesNotThrow(() -> contexts.from(request));

        store.revokeSession("TENANT-SHWS", "admin");
        assertThrows(ApiException.class, () -> contexts.from(request));
    }
}
