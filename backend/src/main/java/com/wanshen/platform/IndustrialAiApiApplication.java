package com.wanshen.platform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class IndustrialAiApiApplication {
    public static void main(String[] args) {
        if (java.util.Arrays.asList(args).contains("--check-config")) {
            try {
                var environment = new org.springframework.core.env.StandardEnvironment();
                environment.getPropertySources().addLast(new org.springframework.core.io.support.ResourcePropertySource(
                        "classpath:application.properties"));
                ProductionEnvironmentValidator.validate(environment);
                System.out.println("Environment configuration accepted.");
                return;
            } catch (Exception exception) {
                throw new IllegalStateException("Configuration check failed; nothing was deployed", exception);
            }
        }
        if (java.util.Arrays.asList(args).contains("--migrate-only")) {
            try {
                com.wanshen.platform.storage.DatabaseMigrationCommand.run(System.getenv());
                return;
            } catch (Exception exception) {
                throw new IllegalStateException("Migration command failed; application was not started", exception);
            }
        }
        SpringApplication.run(IndustrialAiApiApplication.class, args);
    }
}
