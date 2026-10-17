package com.wanshen.platform;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ApiContractParityTests {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void springRoutesMatchRouteInventoryAndGeneratedOpenApi() throws IOException {
        List<Route> sourceRoutes = scanSourceRoutes();
        JsonNode inventory = mapper.readTree(Files.readString(
                Path.of("..", "docs/openapi/backend/v1/route-inventory.json")));
        JsonNode openApi = mapper.readTree(Files.readString(
                Path.of("..", "docs/openapi/backend/v1/generated/all-modules.openapi.json")));

        List<Route> inventoryRoutes = new ArrayList<>();
        inventory.withArray("routes").forEach(item -> inventoryRoutes.add(new Route(
                item.path("method").asText(), item.path("path").asText(),
                item.path("controller").asText(), item.path("classification").asText())));

        Set<String> sourceKeys = Route.keys(sourceRoutes);
        Set<String> inventoryKeys = Route.keys(inventoryRoutes);
        Set<String> openApiKeys = new java.util.HashSet<>();
        openApi.path("paths").fields().forEachRemaining(path -> path.getValue()
                .fields().forEachRemaining(method -> {
                    if (List.of("get", "post", "put", "patch", "delete").contains(method.getKey())) {
                        openApiKeys.add(method.getKey().toUpperCase() + " " + path.getKey());
                    }
                }));

        assertEquals(sourceKeys, inventoryKeys, "Spring routes and route inventory drifted");
        assertEquals(sourceKeys, openApiKeys, "Spring routes and generated OpenAPI drifted");
        assertEquals(sourceRoutes.size(), inventory.path("total").asInt());

        Map<String, String> inventoryByIdentifier = new java.util.HashMap<>();
        inventoryRoutes.forEach(route -> inventoryByIdentifier.put(
                route.method() + " " + route.path(), route.classification()));
        sourceRoutes.forEach(route -> assertEquals(route.classification(),
                inventoryByIdentifier.get(route.method() + " " + route.path()),
                "Classification drifted for " + route.method() + " " + route.path()));
    }

    private List<Route> scanSourceRoutes() throws IOException {
        try (Stream<Path> files = Files.walk(Path.of("src/main/java"))) {
            return files.filter(file -> file.toString().endsWith(".java"))
                    .map(this::scanRoutes)
                    .flatMap(List::stream)
                    .sorted(java.util.Comparator.comparing(Route::method)
                            .thenComparing(Route::path))
                    .toList();
        }
    }

    private List<Route> scanRoutes(Path file) {
        try {
            String source = Files.readString(file);
            if (!source.contains("@RestController") && !source.contains("@Controller")) return List.of();
            java.util.regex.Matcher baseMatcher = java.util.regex.Pattern
                    .compile("@RequestMapping\\(\"([^\"]+)\"\\)").matcher(source);
            String base = baseMatcher.find() ? baseMatcher.group(1) : "";
            String controller = file.getFileName().toString().replaceFirst("\\.java$", "");
            java.util.regex.Matcher matcher = java.util.regex.Pattern
                    .compile("@(Get|Post|Put|Patch|Delete)Mapping(?:\\((?:value\\s*=\\s*)?\"([^\"]+)\"[^)]*\\))?")
                    .matcher(source);
            List<Route> routes = new ArrayList<>();
            while (matcher.find()) {
                String method = matcher.group(1).toUpperCase();
                String suffix = matcher.group(2) == null ? "" : matcher.group(2);
                String path = suffix.startsWith("/") ? base + suffix
                        : suffix.isBlank() ? base : base + "/" + suffix;
                String classification = path.contains("/internal/") ? "internal"
                        : isRetired(method, path) ? "retired" : "public";
                routes.add(new Route(method, path, controller, classification));
            }
            return routes;
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to read controller " + file, exception);
        }
    }

    private boolean isRetired(String method, String path) {
        return Set.of(
                "POST /api/v1/fulfillment/rmas",
                "PATCH /api/v1/fulfillment/rmas/{id}/approve",
                "PATCH /api/v1/fulfillment/rmas/{id}/inspect",
                "PATCH /api/v1/fulfillment/rmas/{id}/close",
                "POST /api/v1/fulfillment/customer-receipts",
                "GET /api/v1/platform/outreach-settings",
                "PUT /api/v1/platform/outreach-settings"
        ).contains(method + " " + path);
    }

    private record Route(String method, String path, String controller, String classification) {
        private static Set<String> keys(List<Route> routes) {
            Set<String> keys = new java.util.HashSet<>();
            routes.forEach(route -> keys.add(route.method() + " " + route.path()));
            return keys;
        }
    }
}
