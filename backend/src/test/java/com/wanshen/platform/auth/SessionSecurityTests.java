package com.wanshen.platform.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.platform.InMemoryPlatformProvisioningStore;
import com.wanshen.platform.platform.TenantProvisioningService;
import com.wanshen.platform.web.ApiExceptionHandler;
import com.wanshen.platform.web.RequestContextService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SessionSecurityTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final PasswordHasher passwords = new PasswordHasher();
    private final InMemoryRegisteredUserStore users = new InMemoryRegisteredUserStore();
    private final TokenService tokens = new TokenService("security-test-secret", mapper);
    private final InMemoryPlatformProvisioningStore platform = new InMemoryPlatformProvisioningStore();
    private final AtomicReference<String> mailedToken = new AtomicReference<>();
    private boolean rejectMail;
    private MockMvc mvc;
    private RegisteredUser employee;

    @BeforeEach void setup() {
        employee = users.createUser(new RegisteredUserStore.CreateUserInput("employee", passwords.hash("Password123"),
                "Employee", "13800138000", "employee@example.test", "T", "Tenant", "manufacturing",
                false, "Production", "E1", "viewer"));
        users.updateFirstLogin(employee.account(), false);
        var controller = new AuthController(users, new CaptchaService(), passwords, tokens,
                new TenantProvisioningService(platform), false, "test01", "123456",
                "sendgrid", "test-mail-key", "https://example.test",
                (phone, code) -> new SmsSender.Delivery("test", false)) {
            @Override protected void sendResetEmail(String email, String token) {
                if (rejectMail) throw new IllegalStateException("test delivery failure");
                mailedToken.set(token);
            }
        };
        mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
    }

    private String token() {
        return tokens.issue("employee", "Employee", "viewer", List.of("T"), List.of(), "registered-user-v1").accessToken();
    }

    @Test void forgotPasswordNeverReturnsTokenAndUsesIdenticalResponseForUnknownEmail() throws Exception {
        String known = mvc.perform(post("/api/v1/session/password/forgot").contentType("application/json")
                .content("{\"email\":\"employee@example.test\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.resetToken").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertThat(mailedToken.get()).hasSize(6).matches("\\d{6}");
        String unknown = mvc.perform(post("/api/v1/session/password/forgot").contentType("application/json")
                .content("{\"email\":\"unknown@example.test\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(known).isEqualTo(unknown);
    }

    @Test void resetTokenIsSingleUseAndInvalidatesPreviouslyIssuedSessions() throws Exception {
        String old = token();
        String reset = users.generateResetToken(employee.email());
        String hash = passwords.hash("Replacement123");
        var pool = Executors.newFixedThreadPool(2);
        try {
            var start = new CountDownLatch(1);
            var a = pool.submit(() -> { start.await(); return users.resetPassword(reset, hash); });
            var b = pool.submit(() -> { start.await(); return users.resetPassword(reset, hash); });
            start.countDown();
            assertThat((a.get() ? 1 : 0) + (b.get() ? 1 : 0)).isEqualTo(1);
        } finally { pool.shutdownNow(); }
        assertThatThrownBy(() -> tokens.verify(old)).isInstanceOf(TokenService.InvalidTokenException.class);
        assertThat(passwords.verify("Replacement123", users.findByAccount("employee").orElseThrow().passwordHash())).isTrue();
    }

    @Test void emailDeliveryFailureDoesNotRevealRegisteredAddress() throws Exception {
        rejectMail = true;
        String known = mvc.perform(post("/api/v1/session/password/forgot").contentType("application/json")
                .content("{\"email\":\"employee@example.test\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.resetToken").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        String unknown = mvc.perform(post("/api/v1/session/password/forgot").contentType("application/json")
                .content("{\"email\":\"unknown@example.test\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(known).isEqualTo(unknown);
    }

    @Test void refreshPreservesIdentityAndTenantAndConsumesTheOldSession() throws Exception {
        String old = token();
        String body = mvc.perform(post("/api/v1/session/refresh").header("Authorization", "Bearer " + old))
                .andExpect(status().isOk()).andExpect(jsonPath("$.user.permissions").isEmpty())
                .andExpect(jsonPath("$.user.tenantIds.length()").value(1))
                .andExpect(jsonPath("$.user.tenantIds[0]").value("T"))
                .andExpect(jsonPath("$.user.role").value("viewer"))
                .andReturn().getResponse().getContentAsString();
        String replacement = mapper.readTree(body).path("accessToken").asText();
        assertThat(tokens.verify(replacement).sub()).isEqualTo("employee");
        mvc.perform(post("/api/v1/session/refresh").header("Authorization", "Bearer " + old)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/session/me").header("Authorization", "Bearer " + old)).andExpect(status().isUnauthorized());
    }

    @Test void logoutWorksWithoutTenantHeaderAndAllowsNewLoginSession() throws Exception {
        String old = token();
        mvc.perform(post("/api/v1/session/logout").header("Authorization", "Bearer " + old)).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/session/refresh").header("Authorization", "Bearer " + old)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/session/me").header("Authorization", "Bearer " + token())).andExpect(status().isOk());
        var request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + old);
        assertThatThrownBy(() -> new RequestContextService(tokens, platform).from(request))
                .isInstanceOf(com.wanshen.platform.web.ApiException.class);
    }

    @Test void employeesCannotListCreateDisableOrResetAccounts() throws Exception {
        String bearer = "Bearer " + token();
        mvc.perform(get("/api/v1/platform/employee-accounts").header("Authorization", bearer)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/platform/employee-accounts").header("Authorization", bearer)
                .contentType("application/json").content("{}")).andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/platform/employee-accounts/" + employee.id() + "/status").header("Authorization", bearer)
                .contentType("application/json").content("{\"status\":\"disabled\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/platform/employee-accounts/" + employee.id() + "/reset-password")
                .header("Authorization", bearer)).andExpect(status().isForbidden());
        assertThat(employee.permissions()).isEmpty();
    }

    @Test void disabledReenabledAndPasswordChangedAccountsCannotReuseOldTokens() {
        String old = token();
        users.updateUserStatus(employee.id(), "disabled");
        assertThatThrownBy(() -> tokens.verify(old)).isInstanceOf(TokenService.InvalidTokenException.class);
        users.updateUserStatus(employee.id(), "active");
        assertThatThrownBy(() -> tokens.verify(old)).isInstanceOf(TokenService.InvalidTokenException.class);
        String fresh = token();
        users.updatePassword(employee.account(), passwords.hash("NewPassword123"));
        assertThatThrownBy(() -> tokens.verify(fresh)).isInstanceOf(TokenService.InvalidTokenException.class);
        assertThat(tokens.verify(token()).permissions()).isEmpty();
    }

    @Test void rejectsUnknownDemoAndForeignTenantIdentitiesInFormalMode() throws Exception {
        String unknown = tokens.issue("test01", "Demo", "admin", List.of("TENANT-SHWS"), List.of("*"), "test").accessToken();
        mvc.perform(post("/api/v1/session/refresh").header("Authorization", "Bearer " + unknown)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/platform/employee-accounts").header("Authorization", "Bearer " + token())
                .header("X-Tenant-Id", "OTHER")).andExpect(status().isForbidden());
        String forgedScope = tokens.issue("employee", "Employee", "admin", List.of("T", "OTHER"), List.of("*"), "test").accessToken();
        assertThatThrownBy(() -> tokens.verify(forgedScope)).isInstanceOf(TokenService.InvalidTokenException.class);
    }

    @Test void firstLoginSessionCannotAccessBusinessApisBeforePasswordChange() throws Exception {
        users.updateFirstLogin("employee", true);
        String first = token();
        mvc.perform(get("/api/v1/session/me").header("Authorization", "Bearer " + first)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/session/complete-first-login").contentType("application/json").content("""
                {"account":"employee","currentPassword":"Password123","newPassword":"NewPassword123"}
                """)).andExpect(status().isNoContent());
        assertThatThrownBy(() -> tokens.verify(first)).isInstanceOf(TokenService.InvalidTokenException.class);
        assertThat(tokens.verify(token()).sub()).isEqualTo("employee");
    }

    @Test void productionQueriesRejectAnAuthenticatedAccountWithNoReadPermissions() {
        var production = new com.wanshen.platform.production.ProductionService(
                new com.wanshen.platform.production.ProductionStore(), mapper);
        var context = new RequestContextService.RequestContext("T", "employee", List.of(), "security", null, null);
        assertThatThrownBy(() -> production.listDemands(context, null, null, null, 1, 20))
                .isInstanceOf(com.wanshen.platform.web.ApiException.class);
        assertThatThrownBy(() -> production.listWorkOrders(context, null, null, null, 1, 20))
                .isInstanceOf(com.wanshen.platform.web.ApiException.class);
        assertThatThrownBy(() -> production.dashboard(context)).isInstanceOf(com.wanshen.platform.web.ApiException.class);
        assertThatThrownBy(() -> production.inspections(context, null)).isInstanceOf(com.wanshen.platform.web.ApiException.class);
        assertThatThrownBy(() -> production.completions(context, null)).isInstanceOf(com.wanshen.platform.web.ApiException.class);
        assertThatThrownBy(() -> production.closes(context)).isInstanceOf(com.wanshen.platform.web.ApiException.class);
    }
}
