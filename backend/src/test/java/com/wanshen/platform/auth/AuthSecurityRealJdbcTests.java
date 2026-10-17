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
class AuthSecurityRealJdbcTests {
    private RegisteredUser create(JdbcRegisteredUserStore users, String tenant, boolean admin) {
        String id = UUID.randomUUID().toString();
        return users.createUser(new RegisteredUserStore.CreateUserInput("user-" + id, "old-hash", "User",
                id.substring(0, 18), id + "@example.test", tenant, "Tenant", "manufacturing", admin,
                "Department", "Position", "Employee", "viewer"));
    }
    private HikariDataSource data() {
        var config = new HikariConfig();
        config.setJdbcUrl(System.getenv("JAVA_JDBC_URL")); config.setMaximumPoolSize(4);
        return new HikariDataSource(config);
    }

    @Test void multipleEmployeesDefaultDenyAndIdentityLookupWorksUnderRestrictedRlsRole() throws Exception {
        try (var data = data()) {
            var store = new JdbcRegisteredUserStore(data, new ObjectMapper());
            String tenant = "auth-test-" + UUID.randomUUID();
            RegisteredUser owner = create(store, tenant, true);
            RegisteredUser one = create(store, tenant, false);
            RegisteredUser two = create(store, tenant, false);
            assertThat(store.listUsersByTenant(tenant)).hasSize(3);
            assertThat(owner.permissions()).containsExactly("*");
            assertThat(one.permissions()).isEmpty();
            assertThat(two.permissions()).isEmpty();
            assertThat(store.findById(one.id())).isPresent();
            assertThat(store.findByAccount(one.account())).isPresent();
            try (var connection = data.getConnection()) {
                connection.setAutoCommit(false);
                try (var statement = connection.prepareStatement("SELECT count(*) FROM registered_users WHERE tenant_id = ?")) {
                    statement.setString(1, tenant);
                    try (var rows = statement.executeQuery()) { rows.next(); assertThat(rows.getInt(1)).isZero(); }
                }
                try (var statement = connection.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
                    statement.setString(1, tenant); statement.execute();
                }
                try (var statement = connection.prepareStatement("UPDATE registered_users SET permissions = '{}'::jsonb WHERE account = ?")) {
                    statement.setString(1, one.account()); assertThat(statement.executeUpdate()).isEqualTo(1);
                }
                connection.commit();
            }
            assertThat(store.findByAccount(one.account()).orElseThrow().permissions()).isEmpty();
        }
    }

    @Test void resetHashIsNotPlaintextAndConcurrentConsumeUpdatesPasswordOnce() throws Exception {
        try (var data = data()) {
            var first = new JdbcRegisteredUserStore(data, new ObjectMapper());
            var second = new JdbcRegisteredUserStore(data, new ObjectMapper());
            var user = create(first, "auth-test-" + UUID.randomUUID(), false);
            String previous = first.generateResetToken(user.email());
            String token = first.generateResetToken(user.email());
            assertThat(first.resetPassword(previous, "wrong")).isFalse();
            try (var connection = data.getConnection();
                 var statement = connection.prepareStatement("SELECT token FROM password_reset_tokens WHERE email = ? AND NOT used")) {
                statement.setString(1, user.email());
                try (var rows = statement.executeQuery()) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getString(1)).isEqualTo(ResetTokens.hash(token)).isNotEqualTo(token);
                }
            }
            var pool = Executors.newFixedThreadPool(2);
            try {
                var start = new CountDownLatch(1);
                var a = pool.submit(() -> { start.await(); return first.resetPassword(token, "new-hash"); });
                var b = pool.submit(() -> { start.await(); return second.resetPassword(token, "new-hash"); });
                start.countDown();
                assertThat((a.get() ? 1 : 0) + (b.get() ? 1 : 0)).isEqualTo(1);
            } finally { pool.shutdownNow(); }
            RegisteredUser updated = first.findByAccount(user.account()).orElseThrow();
            assertThat(updated.passwordHash()).isEqualTo("new-hash");
            assertThat(updated.sessionVersion()).isEqualTo(user.sessionVersion() + 1);
            assertThat(updated.firstLogin()).isFalse();
            String jti = UUID.randomUUID().toString();
            assertThat(first.consumeSession(jti, java.time.Instant.now().plusSeconds(3600).getEpochSecond())).isTrue();
            assertThat(second.consumeSession(jti, java.time.Instant.now().plusSeconds(3600).getEpochSecond())).isFalse();
            assertThat(second.isSessionConsumed(jti)).isTrue();
        }
    }
}
