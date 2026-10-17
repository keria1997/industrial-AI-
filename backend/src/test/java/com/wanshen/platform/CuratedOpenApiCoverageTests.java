package com.wanshen.platform;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertTrue;

class CuratedOpenApiCoverageTests {
    private static final List<String> CURATED_CONTRACTS = List.of(
            "ai.yaml",
            "message.yaml",
            "personnel.yaml",
            "supply-chain.yaml",
            "inventory-master.yaml",
            "platform-compat.yaml",
            "production-client.yaml",
            "finance-closure.yaml",
            "workbench.yaml"
    );

    private final ObjectMapper mapper = new ObjectMapper();
    private final Yaml yaml = new Yaml();

    @Test
    void curatedOperationsRemainCoveredByGeneratedRouteContract() throws IOException {
        JsonNode generated = mapper.readTree(Files.readString(
                Path.of("..", "docs/openapi/backend/v1/generated/all-modules.openapi.json")));
        Set<String> generatedOperations = new java.util.HashSet<>();
        generated.path("paths").fields().forEachRemaining(path -> path.getValue()
                .fields().forEachRemaining(method -> {
                    if (List.of("get", "post", "put", "patch", "delete").contains(method.getKey())) {
                        generatedOperations.add(method.getKey().toUpperCase() + " " + path.getKey());
                    }
                }));

        for (String filename : CURATED_CONTRACTS) {
            Path path = Path.of("..", "docs/openapi/backend/v1", filename);
            @SuppressWarnings("unchecked") var document = (java.util.Map<String, Object>) yaml.load(Files.readString(path));
            @SuppressWarnings("unchecked") var paths = (java.util.Map<String, Object>) document.get("paths");
            paths.forEach((pathValue, operations) -> {
                @SuppressWarnings("unchecked") var operationMap = (java.util.Map<String, Object>) operations;
                operationMap.keySet().stream()
                        .filter(method -> List.of("get", "post", "put", "patch", "delete").contains(method))
                        .forEach(method -> {
                            String operation = method.toUpperCase() + " /api/v1" + pathValue;
                            assertTrue(generatedOperations.contains(operation),
                                    "Curated operation missing from generated contract: " + operation);
                        });
            });
        }
    }
}
