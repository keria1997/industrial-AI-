package com.wanshen.platform.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.web.ApiException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
public class SmsConfiguration {
    @Bean
    SmsSender smsSender(Environment env, ObjectMapper mapper) {
        String provider = env.getProperty("app.auth.sms-provider", "console");
        if ("volcengine".equals(provider)) {
            return new VolcengineSmsSender(new VolcengineSmsSender.Settings(
                    env.getProperty("app.auth.sms-access-key-id", ""),
                    env.getProperty("app.auth.sms-access-key-secret", ""),
                    env.getProperty("app.auth.sms-account", ""),
                    env.getProperty("app.auth.sms-sign-name", ""),
                    env.getProperty("app.auth.sms-template-code", ""),
                    env.getProperty("app.auth.sms-template-variable", "code")), mapper);
        }
        if ("console".equals(provider) && env.getProperty("app.auth.demo-enabled", Boolean.class, false)) {
            return (phone, code) -> new SmsSender.Delivery("", true);
        }
        return (phone, code) -> {
            throw new ApiException(424, "AUTH_SMS_CONFIGURATION",
                    "短信服务未配置", "请联系管理员配置短信服务");
        };
    }
}
