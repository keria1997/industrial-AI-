package com.wanshen.platform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class IndustrialAiApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(IndustrialAiApiApplication.class, args);
    }
}
