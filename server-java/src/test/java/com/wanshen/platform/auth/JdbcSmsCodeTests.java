package com.wanshen.platform.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "JAVA_JDBC_URL", matches = ".+")
class JdbcSmsCodeTests {
    @Test void persistsReplacementExpiryAndSingleUseUnderConcurrentLogin() throws Exception {
        var config = new HikariConfig();
        config.setJdbcUrl(System.getenv("JAVA_JDBC_URL"));
        config.setMaximumPoolSize(4);
        String phone = "199" + String.format("%08d", Integer.toUnsignedLong(UUID.randomUUID().hashCode()) % 100000000);
        try (var data = new HikariDataSource(config)) {
            try {
                var store = new JdbcRegisteredUserStore(data, new ObjectMapper());
                store.saveSmsCode(phone, "111111");
                store.saveSmsCode(phone, "222222");
                var reloaded = new JdbcRegisteredUserStore(data, new ObjectMapper());
                assertThat(reloaded.verifySmsCode(phone, "111111")).isFalse();
                var pool = Executors.newFixedThreadPool(2);
                try {
                    var start = new CountDownLatch(1);
                    var first = pool.submit(() -> { start.await(); return reloaded.verifySmsCode(phone, "222222"); });
                    var second = pool.submit(() -> { start.await(); return reloaded.verifySmsCode(phone, "222222"); });
                    start.countDown();
                    assertThat((first.get() ? 1 : 0) + (second.get() ? 1 : 0)).isEqualTo(1);
                } finally {
                    pool.shutdownNow();
                }
                store.saveSmsCode(phone, "333333");
                try (var connection = data.getConnection(); var statement = connection.prepareStatement(
                        "UPDATE sms_codes SET expires_at = now() - interval '1 second' WHERE phone = ?")) {
                    statement.setString(1, phone);
                    statement.executeUpdate();
                }
                assertThat(reloaded.verifySmsCode(phone, "333333")).isFalse();
            } finally {
                try (var connection = data.getConnection(); var statement = connection.prepareStatement(
                        "DELETE FROM sms_codes WHERE phone = ?")) {
                    statement.setString(1, phone);
                    statement.executeUpdate();
                }
            }
        }
    }
}
