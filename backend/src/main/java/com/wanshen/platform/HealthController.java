package com.wanshen.platform;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.env.Environment;
import org.springframework.http.ResponseEntity;
import com.wanshen.platform.storage.DatabaseMigrationRunner;
import com.wanshen.platform.storage.PostgresDatabaseMigrator;

import java.time.Instant;
import java.util.Map;

@RestController
public class HealthController {
    private final ObjectProvider<javax.sql.DataSource> dataSources;
    private final Environment environment;
    private final WorkerHealth workers;

    public HealthController(ObjectProvider<javax.sql.DataSource> dataSources, Environment environment, WorkerHealth workers) {
        this.dataSources = dataSources;
        this.environment = environment;
        this.workers = workers;
    }

    @GetMapping("/healthz")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "runtime", "java", "at", Instant.now().toString());
    }

    @GetMapping("/readyz")
    public ResponseEntity<Map<String, Object>> readiness() {
        boolean ready = true;
        Map<String, Object> checks = new java.util.LinkedHashMap<>();
        try {
            javax.sql.DataSource dataSource = dataSources.getIfAvailable();
            if (dataSource == null) throw new IllegalStateException("database unavailable");
            try (var connection = dataSource.getConnection()) {
                if (!connection.isValid(3)) throw new IllegalStateException("database unavailable");
                try (var statement = connection.prepareStatement("SELECT filename, checksum FROM public.schema_migrations");
                     var rows = statement.executeQuery()) {
                    var applied = new java.util.HashMap<String, String>();
                    while (rows.next()) applied.put(rows.getString(1), rows.getString(2));
                    for (var file : DatabaseMigrationRunner.migrationFiles()) {
                        if (!PostgresDatabaseMigrator.migrationChecksum(file.sql()).equals(applied.get(file.filename()))) {
                            throw new IllegalStateException("migration mismatch");
                        }
                    }
                }
                checks.put("database", "UP");
                checks.put("migrations", "CURRENT");
            }
        } catch (Exception exception) {
            ready = false;
            checks.put("database", "NOT_READY");
        }
        for (String worker : java.util.List.of("production", "fulfillment")) {
            if (environment.getProperty("app." + worker + ".worker-enabled", Boolean.class, false)) {
                var state = workers.status(worker, Math.max(30,
                        environment.getProperty("app." + worker + ".worker.interval-ms", Long.class, 2000L) / 1000 * 5));
                checks.put(worker + "Worker", state);
                ready &= Boolean.TRUE.equals(state.get("ready"));
            }
        }
        return ResponseEntity.status(ready ? 200 : 503).body(Map.of(
                "status", ready ? "ready" : "not_ready", "checks", checks, "at", Instant.now().toString()));
    }
}
