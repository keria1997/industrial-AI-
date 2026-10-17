package com.wanshen.platform.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.platform.InMemoryPlatformProvisioningStore;
import com.wanshen.platform.platform.TenantProvisioningService;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.ApiExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AuthSmsTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final InMemoryRegisteredUserStore users = new InMemoryRegisteredUserStore();
    private final String phone = "13800138000";

    private MockMvc mvc(SmsSender sender) {
        return MockMvcBuilders.standaloneSetup(new AuthController(users, new CaptchaService(), new PasswordHasher(),
                new TokenService("test-secret", mapper), new TenantProvisioningService(new InMemoryPlatformProvisioningStore()),
                true, "test01", "123456", "console", "", "http://localhost", sender))
                .setControllerAdvice(new ApiExceptionHandler()).build();
    }

    private RegisteredUser user() {
        return users.createUser(new RegisteredUserStore.CreateUserInput("registered", "hash", "SMS user", phone,
                "sms@example.com", "SMS-TENANT", "SMS tenant", "industry", true, "", "", "", "老板"));
    }

    private String body(String phone, String code) {
        return "{\"phone\":\"" + phone + "\",\"code\":\"" + code + "\"}";
    }

    @Test void authenticatesOnlyBoundAccountAndConsumesCodeOnceWithoutLeakingIt() throws Exception {
        user();
        AtomicReference<String> code = new AtomicReference<>();
        MockMvc mvc = mvc((to, value) -> { code.set(value); return new SmsSender.Delivery("request-1", false); });
        mvc.perform(post("/api/v1/session/sms/send-code").contentType("application/json").content(body(phone, "")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.devCode").doesNotExist())
                .andExpect(jsonPath("$.requestId").value("request-1"));
        assertThat(code.get()).matches("\\d{6}");
        mvc.perform(post("/api/v1/session/sms/login").contentType("application/json").content(body(phone, code.get())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.user.account").value("registered"))
                .andExpect(jsonPath("$.user.tenantIds[0]").value("SMS-TENANT"))
                .andExpect(jsonPath("$.accessToken").isNotEmpty());
        mvc.perform(post("/api/v1/session/sms/login").contentType("application/json").content(body(phone, code.get())))
                .andExpect(status().isUnauthorized());
    }

    @Test void failedSendingLeavesNoUsableCode() throws Exception {
        user();
        AtomicReference<String> code = new AtomicReference<>();
        MockMvc mvc = mvc((to, value) -> { code.set(value); throw new ApiException(424, "SEND_FAILED", "failed", "retry later"); });
        mvc.perform(post("/api/v1/session/sms/send-code").contentType("application/json").content(body(phone, "")))
                .andExpect(status().isFailedDependency());
        assertThat(users.verifySmsCode(phone, code.get())).isFalse();
    }

    @Test void unboundPhoneCanReceiveCodeWithoutCreatingAnAccountOrSession() throws Exception {
        AtomicReference<String> sent = new AtomicReference<>();
        AtomicReference<String> code = new AtomicReference<>();
        MockMvc mvc = mvc((to, value) -> {
            sent.set(to); code.set(value); return new SmsSender.Delivery("unbound-request", false);
        });
        mvc.perform(post("/api/v1/session/sms/send-code").contentType("application/json").content(body(phone, "")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.requestId").value("unbound-request"))
                .andExpect(jsonPath("$.devCode").doesNotExist()).andExpect(jsonPath("$.accessToken").doesNotExist());
        assertThat(sent.get()).isEqualTo(phone);
        assertThat(code.get()).matches("\\d{6}");
        assertThat(users.findByPhone(phone)).isEmpty();
        mvc.perform(post("/api/v1/session/sms/login").contentType("application/json").content(body(phone, code.get())))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.accessToken").doesNotExist());
        assertThat(users.verifySmsCode(phone, code.get())).isTrue();
    }

    @Test void disabledAccountCannotSendOrLogin() throws Exception {
        AtomicReference<String> sent = new AtomicReference<>();
        MockMvc mvc = mvc((to, value) -> { sent.set(to); return new SmsSender.Delivery("", true); });
        var registered = user();
        users.updateUserStatus(registered.id(), "disabled");
        users.saveSmsCode(phone, "123456");
        mvc.perform(post("/api/v1/session/sms/send-code").contentType("application/json").content(body(phone, "")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/session/sms/login").contentType("application/json").content(body(phone, "123456")))
                .andExpect(status().isForbidden());
        assertThat(sent.get()).isNull();
    }

    @Test void smsCannotBypassInitialPasswordSetup() throws Exception {
        var registered = user();
        users.updateFirstLogin(registered.account(), true);
        users.saveSmsCode(phone, "123456");
        mvc((to, value) -> new SmsSender.Delivery("", true))
                .perform(post("/api/v1/session/sms/login").contentType("application/json").content(body(phone, "123456")))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.accessToken").doesNotExist());
    }

    @Test void sendCooldownAndLoginAttemptLimitsAreServerEnforced() throws Exception {
        user();
        MockMvc mvc = mvc((to, value) -> new SmsSender.Delivery("", true));
        mvc.perform(post("/api/v1/session/sms/send-code").contentType("application/json").content(body(phone, "")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.devCode").isNotEmpty());
        mvc.perform(post("/api/v1/session/sms/send-code").contentType("application/json").content(body(phone, "")))
                .andExpect(status().isTooManyRequests());
        for (int i = 0; i < 5; i++) {
            mvc.perform(post("/api/v1/session/sms/login").contentType("application/json").content(body(phone, "000000")))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/v1/session/sms/login").contentType("application/json").content(body(phone, "000000")))
                .andExpect(status().isTooManyRequests());
    }

    @Test void rejectsNonNumericCodesAndInvalidPhonesAndReplacesOldChallenges() throws Exception {
        user();
        MockMvc mvc = mvc((to, value) -> new SmsSender.Delivery("", true));
        mvc.perform(post("/api/v1/session/sms/login").contentType("application/json").content(body(phone, "ABCDEF")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/session/sms/send-code").contentType("application/json").content(body("123", "")))
                .andExpect(status().isBadRequest());
        users.saveSmsCode(phone, "111111");
        users.saveSmsCode(phone, "222222");
        assertThat(users.verifySmsCode(phone, "111111")).isFalse();
        assertThat(users.verifySmsCode(phone, "222222")).isTrue();
        assertThat(users.verifySmsCode(phone, "222222")).isFalse();
    }
}
