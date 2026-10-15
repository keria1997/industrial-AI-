package com.wanshen.platform;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;

class ProductionEnvironmentValidatorTests {
    @Test void rejectsProductionDefaultsAndMissingIntegrationBeforeStartup() {
        var env = new MockEnvironment().withProperty("APP_ENV", "production");
        assertThatThrownBy(() -> ProductionEnvironmentValidator.validate(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("AUTH_SECRET").hasMessageContaining("DATABASE_URL")
                .hasMessageContaining("DEMO_AUTH_ENABLED").hasMessageContaining("WMS");
    }
    @Test void rejectsDefaultEncryptionKeyAndDoesNotPrintSecrets() {
        String secret = "some-private-secret";
        var env = new MockEnvironment().withProperty("APP_ENV", "production")
                .withProperty("AUTH_SECRET", secret)
                .withProperty("FULFILLMENT_DATA_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY");
        assertThatThrownBy(() -> ProductionEnvironmentValidator.validate(env))
                .hasMessageContaining("FULFILLMENT_DATA_KEY").hasMessageNotContaining(secret);
    }
    @Test void developmentCanStillUseIsolatedMemoryStores() {
        assertThatCode(() -> ProductionEnvironmentValidator.validate(new MockEnvironment())).doesNotThrowAnyException();
    }

    @Test
    void acceptsApprovedAiImportInventoryAuthorityWithoutReferenceFallback() {
        var env = productionEnvironment();
        env.withProperty("INVENTORY_AUTHORITY_MODE", "AI_IMPORT")
                .withProperty("WMS_INTERFACE_ONLY", "true")
                .withProperty("INVENTORY_IMPORT_ACK", "customer-wms-via-ai-import-approved");
        assertThatCode(() -> ProductionEnvironmentValidator.validate(env)).doesNotThrowAnyException();
    }

    @Test
    void rejectsReferenceInventoryAuthorityInProduction() {
        var env = productionEnvironment();
        assertThatThrownBy(() -> ProductionEnvironmentValidator.validate(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("INVENTORY_AUTHORITY_MODE must be AI_IMPORT or CUSTOMER_WMS");
    }

    private static MockEnvironment productionEnvironment() {
        var env = new MockEnvironment()
                .withProperty("APP_ENV", "production")
                .withProperty("AUTH_SECRET", "a".repeat(48))
                .withProperty("DATABASE_URL", "postgresql://user:a-private-password@db:5432/platform")
                .withProperty("FULFILLMENT_DATA_KEY", "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=")
                .withProperty("app.auth.demo-enabled", "false")
                .withProperty("app.auth.email-provider", "sendgrid")
                .withProperty("SENDGRID_API_KEY", "a-sufficiently-long-sendgrid-key")
                .withProperty("AUTH_EMAIL_FROM", "no-reply@example.com")
                .withProperty("APP_BASE_URL", "https://platform.example.com")
                .withProperty("app.auth.sms-provider", "volcengine")
                .withProperty("SMS_ACCOUNT", "production")
                .withProperty("SMS_ACCESS_KEY_ID", "production")
                .withProperty("SMS_ACCESS_KEY_SECRET", "production")
                .withProperty("SMS_SIGN_NAME", "production")
                .withProperty("SMS_TEMPLATE_CODE", "production")
                .withProperty("INVENTORY_FACT_MAX_AGE_SECONDS", "300")
                .withProperty("PRODUCTION_WORKER_ENABLED", "true")
                .withProperty("FULFILLMENT_WORKER_ENABLED", "true");
        return env;
    }
}
