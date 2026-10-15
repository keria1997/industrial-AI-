package com.wanshen.platform;

import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.Ordered;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;

@Component
public class ProductionEnvironmentValidator implements BeanFactoryPostProcessor, EnvironmentAware, Ordered {
    private Environment environment;

    @Override public void setEnvironment(Environment environment) { this.environment = environment; }
    @Override public int getOrder() { return Ordered.HIGHEST_PRECEDENCE; }
    @Override public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) { validate(environment); }

    public static boolean production(Environment env) {
        return "production".equalsIgnoreCase(env.getProperty("APP_ENV", "development"))
                || Arrays.asList(env.getActiveProfiles()).contains("production");
    }

    public static void validate(Environment env) {
        if (!production(env)) return;
        List<String> errors = new ArrayList<>();
        requireSecret(env, "AUTH_SECRET", 48, errors);
        requireSecret(env, "DATABASE_URL", 20, errors);
        String key = env.getProperty("FULFILLMENT_DATA_KEY", "");
        try {
            if (Base64.getDecoder().decode(key).length != 32
                    || "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY".equals(key)) errors.add("FULFILLMENT_DATA_KEY");
        } catch (IllegalArgumentException exception) { errors.add("FULFILLMENT_DATA_KEY"); }
        if (env.getProperty("app.auth.demo-enabled", Boolean.class, true)) errors.add("DEMO_AUTH_ENABLED must be false");
        if (env.getProperty("app.database.migrate", Boolean.class, false)) errors.add("run migrations separately from the application");
        if (!"sendgrid".equals(env.getProperty("app.auth.email-provider"))) errors.add("EMAIL_PROVIDER must be sendgrid");
        requireSecret(env, "SENDGRID_API_KEY", 20, errors);
        if (!env.getProperty("AUTH_EMAIL_FROM", "").matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) errors.add("AUTH_EMAIL_FROM");
        String base = env.getProperty("APP_BASE_URL", "");
        if (!base.matches("https://[A-Za-z0-9][^\\s<>\"']*")) errors.add("APP_BASE_URL must use HTTPS");
        if (!"127.0.0.1".equals(env.getProperty("PRODUCTION_API_HOST", "127.0.0.1"))) errors.add("API must bind to loopback behind nginx");
        if (!"volcengine".equals(env.getProperty("app.auth.sms-provider"))) errors.add("SMS_PROVIDER must be volcengine");
        for (String name : List.of("SMS_ACCOUNT", "SMS_ACCESS_KEY_ID", "SMS_ACCESS_KEY_SECRET", "SMS_SIGN_NAME", "SMS_TEMPLATE_CODE")) {
            requireSecret(env, name, 1, errors);
        }
        if (env.getProperty("INVENTORY_FACT_MAX_AGE_SECONDS", Long.class, 0L) <= 0) errors.add("INVENTORY_FACT_MAX_AGE_SECONDS");
        for (String name : List.of("PRODUCTION_WORKER_ENABLED", "FULFILLMENT_WORKER_ENABLED")) {
            if (!env.getProperty(name, Boolean.class, false)) errors.add(name + " must be true");
        }
        String authorityMode = env.getProperty("INVENTORY_AUTHORITY_MODE", "");
        if ("AI_IMPORT".equals(authorityMode)) {
            if (!"true".equalsIgnoreCase(env.getProperty("WMS_INTERFACE_ONLY", ""))) errors.add("WMS_INTERFACE_ONLY must be true");
            if (!"customer-wms-via-ai-import-approved".equals(env.getProperty("INVENTORY_IMPORT_ACK", "")))
                errors.add("INVENTORY_IMPORT_ACK must record the approved interim customer-WMS import mode");
        } else if ("CUSTOMER_WMS".equals(authorityMode)) {
            if (!"true".equalsIgnoreCase(env.getProperty("WMS_INTERFACE_ONLY", ""))) errors.add("WMS_INTERFACE_ONLY must be true");
            errors.add("CUSTOMER_WMS adapter acceptance evidence is required");
        } else {
            errors.add("INVENTORY_AUTHORITY_MODE must be AI_IMPORT or CUSTOMER_WMS; Reference fallback is forbidden");
        }
        if (!errors.isEmpty()) throw new IllegalStateException("Production configuration rejected: " + String.join("; ", errors));
    }

    private static void requireSecret(Environment env, String key, int min, List<String> errors) {
        String value = env.getProperty(key, "");
        String lower = value.toLowerCase(java.util.Locale.ROOT);
        if (value.length() < min || lower.contains("change-me") || lower.contains("local-dev") || lower.contains("placeholder")) {
            errors.add(key);
        }
    }
}
