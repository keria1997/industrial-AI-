package com.wanshen.platform.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.auth.TokenService;
import com.wanshen.platform.storage.PostgresDatabaseMigrator;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.mock.web.MockHttpServletRequest;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@EnabledIfEnvironmentVariable(named = "JAVA_JDBC_URL", matches = ".+")
class PlatformPermissionRealJdbcTests {
    static final ObjectMapper MAPPER = new ObjectMapper();

    @BeforeAll static void migrate() throws Exception {
        try (var migrator = PostgresDatabaseMigrator.open(System.getenv("JAVA_JDBC_MIGRATION_URL"))) {
            var files = new java.util.ArrayList<PostgresDatabaseMigrator.MigrationFile>();
            for (var resource : new org.springframework.core.io.support.PathMatchingResourcePatternResolver()
                    .getResources("classpath*:db/migrations/*.sql")) {
                files.add(new PostgresDatabaseMigrator.MigrationFile(resource.getFilename(),
                        resource.getContentAsString(StandardCharsets.UTF_8)));
            }
            files.sort(java.util.Comparator.comparing(PostgresDatabaseMigrator.MigrationFile::filename));
            migrator.migrate(files, ignored -> {});
        }
    }

    HikariDataSource dataSource() {
        var config = new HikariConfig();
        config.setJdbcUrl(System.getenv("JAVA_JDBC_URL"));
        config.setMaximumPoolSize(4);
        return new HikariDataSource(config);
    }

    @Test void baselineAndMenuPublicationPersistUnderRlsAndChangeAnExistingSession() {
        String tenant = "platform-permission-jdbc-" + UUID.randomUUID();
        try (var data = dataSource(); var store = new JdbcPlatformProvisioningStore(data, MAPPER)) {
            var input = new TenantProvisioningService.Input(tenant, "测试企业", "planner", "计划员");
            assertThat(new TenantProvisioningService(store).provisionBaseline(input).created()).isTrue();
        }
        try (var data = dataSource(); var store = new JdbcPlatformProvisioningStore(data, MAPPER)) {
            assertThat(new TenantProvisioningService(store).provisionBaseline(
                    new TenantProvisioningService.Input(tenant, "测试企业", "planner", "计划员")).created()).isFalse();
            assertThat(store.get(tenant, "tenant", tenant)).isPresent();
            assertThat(store.get("OTHER", "tenant", tenant)).isEmpty();
            var tokenService = new TokenService("test-secret", MAPPER);
            var request = new MockHttpServletRequest();
            request.addHeader("Authorization", "Bearer " + tokenService.issue("planner", "计划员", "生产主管",
                    List.of(tenant), List.of(), "v1").accessToken());
            request.addHeader("X-Tenant-Id", tenant);
            var contexts = new RequestContextService(tokenService, store);
            var service = new PlatformService(store);
            var ctx = new RequestContext(tenant, "admin", List.of("*"), "grant", "grant", 1);
            service.saveRoleGrants(ctx, "ROLE-ADMIN",
                    List.of(Map.of("permissionId", "PERM-MPS-MENU", "effect", "allow")));
            assertThat(contexts.from(request).has("production.demand.approve")).isTrue();
            assertThatThrownBy(() -> service.saveRoleGrants(ctx, "ROLE-ADMIN", List.of()))
                    .isInstanceOf(com.wanshen.platform.web.ApiException.class);
        }
        try (var data = dataSource(); var store = new JdbcPlatformProvisioningStore(data, MAPPER)) {
            assertThat(store.get(tenant, "role", "ROLE-ADMIN").orElseThrow().get("version")).isEqualTo(2);
            var service = new PlatformService(store);
            var ctx = new RequestContext(tenant, "admin", List.of("*"), "revoke", "revoke", 2);
            assertThat(service.roleGrants(ctx, "ROLE-ADMIN")).hasSize(1);
            service.saveRoleGrants(ctx, "ROLE-ADMIN", List.of());
            assertThat(store.list(tenant, "auditLog")).hasSize(2);
        }
        try (var data = dataSource(); var store = new JdbcPlatformProvisioningStore(data, MAPPER)) {
            var tokens = new TokenService("test-secret", MAPPER);
            var request = new MockHttpServletRequest();
            request.addHeader("Authorization", "Bearer " + tokens.issue("planner", "计划员", "生产主管",
                    List.of(tenant), List.of("production.demand.approve"), "v1").accessToken());
            request.addHeader("X-Tenant-Id", tenant);
            assertThat(new RequestContextService(tokens, store).from(request).has("production.demand.approve")).isFalse();
        }
    }
}
