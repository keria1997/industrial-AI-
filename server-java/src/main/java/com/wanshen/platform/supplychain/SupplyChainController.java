package com.wanshen.platform.supplychain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.supplychain.AbstractSupplyChainStore.Customer;
import com.wanshen.platform.supplychain.AbstractSupplyChainStore.CustomerFilter;
import com.wanshen.platform.supplychain.AbstractSupplyChainStore.Page;
import com.wanshen.platform.supplychain.AbstractSupplyChainStore.RiskEvent;
import com.wanshen.platform.supplychain.AbstractSupplyChainStore.RiskFilter;
import com.wanshen.platform.supplychain.AbstractSupplyChainStore.Supplier;
import com.wanshen.platform.supplychain.AbstractSupplyChainStore.SupplierFilter;
import com.wanshen.platform.storage.ModuleInfra.AuditLog;
import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;

@RestController
@RequestMapping("/api/v1/supply-chain")
@ConditionalOnProperty(value = "app.supply-chain.native-enabled", havingValue = "true")
public class SupplyChainController {
    private final AbstractSupplyChainStore store;
    private final RequestContextService contexts;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(java.time.Duration.ofSeconds(2)).build();

    public SupplyChainController(
            AbstractSupplyChainStore store, RequestContextService contexts, ObjectMapper objectMapper
    ) {
        this.store = store;
        this.contexts = contexts;
        this.objectMapper = objectMapper;
    }

    record Command(Object body, int status) {}
    private static final Set<String> LEVELS = AbstractSupplyChainStore.LEVELS;

    @GetMapping("/suppliers")
    public Page<Supplier> suppliers(
            HttpServletRequest request, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String status, @RequestParam(required = false) String rating,
            @RequestParam(required = false) String riskLevel, @RequestParam(required = false) String category,
            @RequestParam(required = false) Boolean admittance, @RequestParam(required = false) String owner,
            @RequestParam(required = false) String search
    ) {
        RequestContext context = require(request, "sc.supplier.read");
        validatePage(page, pageSize);
        enums(status, Set.of("active", "suspended", "blacklisted"), "status");
        enums(rating, Set.of("A", "B", "C", "D"), "rating");
        enums(riskLevel, Set.of("低", "中", "高"), "riskLevel");
        return store.suppliers(context.tenantId(), new SupplierFilter(page, pageSize,
                status, rating, riskLevel, category, admittance, owner, search));
    }

    @GetMapping("/suppliers/{id}")
    public ResponseEntity<Supplier> supplier(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = require(request, "sc.supplier.read");
        validateUuid(id);
        Supplier value = getSupplier(context.tenantId(), id);
        return ResponseEntity.ok().eTag("\"" + value.version() + "\"").body(value);
    }

    @PostMapping("/suppliers")
    public ResponseEntity<?> createSupplier(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = require(request, "sc.supplier.create");
        validateSupplier(input, false);
        String supplierNo = text(input, "supplierNo");
        return command(context, "sc.supplier.create", input, () -> {
            if (store.supplierByNo(context.tenantId(), supplierNo).isPresent()) {
                throw conflict("供应商编号已存在", "使用不同的供应商编号");
            }
            Supplier value = new Supplier(UUID.randomUUID().toString(), context.tenantId(), supplierNo,
                    text(input, "name"), textOrEmpty(input, "creditCode"), textOrEmpty(input, "type"),
                    textOrEmpty(input, "category"), textOrEmpty(input, "qualification"),
                    textOr(input, "rating", "B"), textOr(input, "riskLevel", "低"),
                    textOrEmpty(input, "owner"), input.path("cooperationCount").asInt(0),
                    textOr(input, "totalAmount", "0"), input.path("admittance").asBoolean(false),
                    textOr(input, "status", "active"), metadata(input), textOrEmpty(input, "remark"),
                    1, now(), now(), context.actorId());
            store.saveSupplier(value);
            audit(context, "Supplier", value.id(), 1, "CREATE", null, value);
            outbox(context, "sc.supplier.created.v1", "Supplier", value.id(), 1,
                    Map.of("supplierId", value.id(), "supplierNo", supplierNo));
            return new Command(Map.of("supplier", value), 201);
        });
    }

    @PatchMapping("/suppliers/{id}")
    public ResponseEntity<?> updateSupplier(
            @PathVariable String id, @RequestBody JsonNode patch, HttpServletRequest request
    ) {
        RequestContext context = require(request, "sc.supplier.update");
        validateUuid(id);
        validateSupplier(patch, true);
        return command(context, "sc.supplier.update", Map.of("id", id, "patch", patch), () -> {
            Supplier current = getSupplier(context.tenantId(), id);
            requireVersion(context, current.version());
            Supplier updated = new Supplier(current.id(), current.tenantId(), current.supplierNo(),
                    patchText(patch, "name", current.name()), patchText(patch, "creditCode", current.creditCode()),
                    patchText(patch, "type", current.type()), patchText(patch, "category", current.category()),
                    patchText(patch, "qualification", current.qualification()),
                    patchText(patch, "rating", current.rating()), patchText(patch, "riskLevel", current.riskLevel()),
                    patchText(patch, "owner", current.owner()), patchInt(patch, "cooperationCount", current.cooperationCount()),
                    patchText(patch, "totalAmount", current.totalAmount()),
                    patch.has("admittance") ? patch.get("admittance").asBoolean() : current.admittance(),
                    patchText(patch, "status", current.status()),
                    patch.has("metadata") ? metadata(patch) : current.metadata(),
                    patchText(patch, "remark", current.remark()), current.version() + 1,
                    current.createdAt(), now(), current.createdBy());
            store.saveSupplier(updated);
            audit(context, "Supplier", id, updated.version(), "UPDATE", current, updated);
            return new Command(Map.of("supplier", updated), 200);
        });
    }

    @DeleteMapping("/suppliers/{id}")
    public ResponseEntity<?> deleteSupplier(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = require(request, "sc.supplier.delete");
        validateUuid(id);
        return command(context, "sc.supplier.delete", Map.of("id", id), () -> {
            Supplier current = getSupplier(context.tenantId(), id);
            requireVersion(context, current.version());
            store.deleteSupplier(context.tenantId(), id);
            audit(context, "Supplier", id, current.version(), "DELETE", current, null);
            return new Command(Map.of("deleted", true), 200);
        });
    }

    @GetMapping("/customers")
    public Page<Customer> customers(
            HttpServletRequest request, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String exposureLevel,
            @RequestParam(required = false) String pressureLevel,
            @RequestParam(required = false) String industry,
            @RequestParam(required = false) String search
    ) {
        RequestContext context = require(request, "sc.customer.read");
        validatePage(page, pageSize);
        enums(status, Set.of("active", "frozen", "blacklisted"), "status");
        enums(exposureLevel, LEVELS, "exposureLevel");
        enums(pressureLevel, LEVELS, "pressureLevel");
        return store.customers(context.tenantId(), new CustomerFilter(page, pageSize, status,
                exposureLevel, pressureLevel, industry, search));
    }

    @GetMapping("/customers/{id}")
    public ResponseEntity<Customer> customer(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = require(request, "sc.customer.read");
        validateUuid(id);
        Customer value = getCustomer(context.tenantId(), id);
        return ResponseEntity.ok().eTag("\"" + value.version() + "\"").body(value);
    }

    @PostMapping("/customers")
    public ResponseEntity<?> createCustomer(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = require(request, "sc.customer.create");
        validateCustomer(input, false);
        String customerNo = text(input, "customerNo");
        return command(context, "sc.customer.create", input, () -> {
            if (store.customerByNo(context.tenantId(), customerNo).isPresent()) {
                throw conflict("客户编号已存在", "使用不同的客户编号");
            }
            Customer value = new Customer(UUID.randomUUID().toString(), context.tenantId(), customerNo,
                    text(input, "name"), textOrEmpty(input, "creditCode"),
                    textOrEmpty(input, "legalRepresentative"), textOrEmpty(input, "operationStatus"),
                    textOrEmpty(input, "businessStatus"), textOrEmpty(input, "enterpriseSize"),
                    textOrEmpty(input, "industry"), textOr(input, "revenue", "0"),
                    textOr(input, "receivable", "0"), input.path("overdueDays").asInt(0),
                    textOr(input, "exposureLevel", "低"), textOr(input, "pressureLevel", "低"),
                    textOrEmpty(input, "role"), stringList(input.path("alerts")),
                    textOr(input, "status", "active"), metadata(input), textOrEmpty(input, "remark"),
                    1, now(), now(), context.actorId());
            store.saveCustomer(value);
            audit(context, "Customer", value.id(), 1, "CREATE", null, value);
            outbox(context, "sc.customer.created.v1", "Customer", value.id(), 1,
                    Map.of("customerId", value.id(), "customerNo", customerNo));
            return new Command(Map.of("customer", value), 201);
        });
    }

    @PatchMapping("/customers/{id}")
    public ResponseEntity<?> updateCustomer(
            @PathVariable String id, @RequestBody JsonNode patch, HttpServletRequest request
    ) {
        RequestContext context = require(request, "sc.customer.update");
        validateUuid(id);
        validateCustomer(patch, true);
        return command(context, "sc.customer.update", Map.of("id", id, "patch", patch), () -> {
            Customer current = getCustomer(context.tenantId(), id);
            requireVersion(context, current.version());
            Customer updated = new Customer(current.id(), current.tenantId(), current.customerNo(),
                    patchText(patch, "name", current.name()), patchText(patch, "creditCode", current.creditCode()),
                    patchText(patch, "legalRepresentative", current.legalRepresentative()),
                    patchText(patch, "operationStatus", current.operationStatus()),
                    patchText(patch, "businessStatus", current.businessStatus()),
                    patchText(patch, "enterpriseSize", current.enterpriseSize()),
                    patchText(patch, "industry", current.industry()), patchText(patch, "revenue", current.revenue()),
                    patchText(patch, "receivable", current.receivable()),
                    patchInt(patch, "overdueDays", current.overdueDays()),
                    patchText(patch, "exposureLevel", current.exposureLevel()),
                    patchText(patch, "pressureLevel", current.pressureLevel()),
                    patchText(patch, "role", current.role()),
                    patch.has("alerts") ? stringList(patch.get("alerts")) : current.alerts(),
                    patchText(patch, "status", current.status()),
                    patch.has("metadata") ? metadata(patch) : current.metadata(),
                    patchText(patch, "remark", current.remark()), current.version() + 1,
                    current.createdAt(), now(), current.createdBy());
            store.saveCustomer(updated);
            audit(context, "Customer", id, updated.version(), "UPDATE", current, updated);
            return new Command(Map.of("customer", updated), 200);
        });
    }

    @DeleteMapping("/customers/{id}")
    public ResponseEntity<?> deleteCustomer(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = require(request, "sc.customer.delete");
        validateUuid(id);
        return command(context, "sc.customer.delete", Map.of("id", id), () -> {
            Customer current = getCustomer(context.tenantId(), id);
            requireVersion(context, current.version());
            store.deleteCustomer(context.tenantId(), id);
            audit(context, "Customer", id, current.version(), "DELETE", current, null);
            return new Command(Map.of("deleted", true), 200);
        });
    }

    @GetMapping("/risk-events")
    public Page<RiskEvent> riskEvents(
            HttpServletRequest request, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String riskLevel,
            @RequestParam(required = false) String companyType,
            @RequestParam(required = false) String owner,
            @RequestParam(required = false) String search
    ) {
        RequestContext context = require(request, "sc.risk.read");
        validatePage(page, pageSize);
        enums(status, Set.of("active", "processing", "resolved", "ignored"), "status");
        enums(riskLevel, Set.of("低风险", "中风险", "高风险"), "riskLevel");
        enums(companyType, Set.of("customer", "supplier"), "companyType");
        return store.riskEvents(context.tenantId(), new RiskFilter(page, pageSize, status,
                riskLevel, companyType, owner, search));
    }

    @GetMapping("/risk-events/{id}")
    public ResponseEntity<RiskEvent> riskEvent(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = require(request, "sc.risk.read");
        validateUuid(id);
        RiskEvent value = getRisk(context.tenantId(), id);
        return ResponseEntity.ok().eTag("\"" + value.version() + "\"").body(value);
    }

    @PostMapping("/risk-events")
    public ResponseEntity<?> createRisk(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = require(request, "sc.risk.create");
        validateRisk(input, false);
        return command(context, "sc.risk.create", input, () -> {
            RiskEvent value = new RiskEvent(UUID.randomUUID().toString(), context.tenantId(), riskNo(),
                    text(input, "companyName"), text(input, "companyType"), text(input, "riskType"),
                    text(input, "riskLevel"), textOrEmpty(input, "owner"), textOrEmpty(input, "action"),
                    textOr(input, "status", "active"), metadata(input), textOrEmpty(input, "remark"),
                    1, now(), now(), context.actorId());
            store.saveRiskEvent(value);
            audit(context, "RiskEvent", value.id(), 1, "CREATE", null, value);
            outbox(context, "sc.risk.created.v1", "RiskEvent", value.id(), 1,
                    Map.of("riskEventId", value.id(), "companyName", value.companyName(),
                            "riskLevel", value.riskLevel()));
            return new Command(Map.of("riskEvent", value), 201);
        });
    }

    @PatchMapping("/risk-events/{id}")
    public ResponseEntity<?> updateRisk(
            @PathVariable String id, @RequestBody JsonNode patch, HttpServletRequest request
    ) {
        RequestContext context = require(request, "sc.risk.update");
        validateUuid(id);
        validateRisk(patch, true);
        return command(context, "sc.risk.update", Map.of("id", id, "patch", patch), () -> {
            RiskEvent current = getRisk(context.tenantId(), id);
            requireVersion(context, current.version());
            RiskEvent updated = new RiskEvent(current.id(), current.tenantId(), current.riskNo(),
                    patchText(patch, "companyName", current.companyName()),
                    patchText(patch, "companyType", current.companyType()),
                    patchText(patch, "riskType", current.riskType()),
                    patchText(patch, "riskLevel", current.riskLevel()),
                    patchText(patch, "owner", current.owner()), patchText(patch, "action", current.action()),
                    patchText(patch, "status", current.status()),
                    patch.has("metadata") ? metadata(patch) : current.metadata(),
                    patchText(patch, "remark", current.remark()), current.version() + 1,
                    current.createdAt(), now(), current.createdBy());
            store.saveRiskEvent(updated);
            audit(context, "RiskEvent", id, updated.version(), "UPDATE", current, updated);
            return new Command(Map.of("riskEvent", updated), 200);
        });
    }

    @PostMapping("/risk-events/{id}/resolve")
    public ResponseEntity<?> resolveRisk(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = require(request, "sc.risk.resolve");
        validateUuid(id);
        return command(context, "sc.risk.resolve", Map.of("id", id), () -> {
            RiskEvent current = getRisk(context.tenantId(), id);
            requireVersion(context, current.version());
            if ("resolved".equals(current.status())) throw conflict("风险事件已解决", "刷新风险事件列表后重试");
            RiskEvent updated = new RiskEvent(current.id(), current.tenantId(), current.riskNo(),
                    current.companyName(), current.companyType(), current.riskType(), current.riskLevel(),
                    current.owner(), current.action(), "resolved", current.metadata(), current.remark(),
                    current.version() + 1, current.createdAt(), now(), current.createdBy());
            store.saveRiskEvent(updated);
            audit(context, "RiskEvent", id, updated.version(), "RESOLVE", current, updated);
            outbox(context, "sc.risk.resolved.v1", "RiskEvent", id, updated.version(),
                    Map.of("riskEventId", id, "riskNo", current.riskNo()));
            return new Command(Map.of("riskEvent", updated), 200);
        });
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(HttpServletRequest request) {
        RequestContext context = require(request, "sc.supplier.read");
        Page<Supplier> suppliers = store.suppliers(context.tenantId(), new SupplierFilter(1, 1000,
                null, null, null, null, null, null, null));
        Page<Customer> customers = store.customers(context.tenantId(), new CustomerFilter(1, 1000,
                null, null, null, null, null));
        Page<RiskEvent> risks = store.riskEvents(context.tenantId(), new RiskFilter(1, 1000,
                null, null, null, null, null));
        return Map.of(
                "totalSuppliers", suppliers.total(),
                "activeSuppliers", suppliers.items().stream().filter(item -> "active".equals(item.status())).count(),
                "totalCustomers", customers.total(),
                "activeCustomers", customers.items().stream().filter(item -> "active".equals(item.status())).count(),
                "highRiskSuppliers", suppliers.items().stream().filter(item -> "高".equals(item.riskLevel())).count(),
                "highExposureCustomers", customers.items().stream().filter(item -> "高".equals(item.exposureLevel())).count(),
                "activeRiskEvents", risks.items().stream().filter(item -> "active".equals(item.status())).count(),
                "resolvedRiskEvents", risks.items().stream().filter(item -> "resolved".equals(item.status())).count(),
                "recentRiskEvents", risks.items().stream().limit(10).toList()
        );
    }

    @GetMapping("/company-verifications")
    public Map<String, Object> companyVerification(
            HttpServletRequest request,
            @RequestParam("name") String name,
            @RequestParam(required = false) String creditCode
    ) {
        RequestContext context = require(request, "sc.customer.read");
        if (name == null || name.isBlank() || name.length() > 200) {
            throw bad("name 必填且最长 200 字", "检查企业名称后重试");
        }
        if (creditCode != null && creditCode.length() > 100) throw bad("creditCode 最长 100 字", "检查统一社会信用代码");
        String apiKey = System.getenv("QCC_API_KEY");
        String apiSecret = System.getenv("QCC_API_SECRET");
        if (apiKey == null || apiKey.isBlank() || apiSecret == null || apiSecret.isBlank()) {
            throw new ApiException(503, "PRODUCTION_503_SERVICE_UNAVAILABLE", "企查查服务未配置",
                    "在后端配置 QCC_API_KEY 和 QCC_API_SECRET 后重试");
        }
        String endpoint = System.getenv().getOrDefault("QCC_FUZZY_SEARCH_URL",
                "https://api.qichacha.com/FuzzySearch/GetList");
        JsonNode search = fuzzySearch(endpoint, apiKey, apiSecret, name.trim());
        List<Map<String, Object>> candidates = new ArrayList<>();
        for (JsonNode item : search.path("items")) {
            if (creditCode != null && !creditCode.isBlank() && !text(item, "creditCode").isBlank()
                    && !text(item, "creditCode").equals(creditCode)) continue;
            Map<String, Object> candidate = new LinkedHashMap<>();
            candidate.put("keyNo", item.path("keyNo").asText(null));
            candidate.put("name", text(item, "name"));
            candidate.put("creditCode", item.path("creditCode").asText(null));
            candidate.put("legalRepresentative", item.path("legalRepresentative").asText(null));
            candidate.put("registrationStatus", item.path("registrationStatus").asText(null));
            candidate.put("establishedOn", item.path("establishedOn").asText(null));
            candidate.put("survivalResult", text(item, "survivalResult"));
            candidates.add(candidate);
        }
        List<Map<String, Object>> exact = candidates.stream()
                .filter(item -> name.trim().equals(item.get("name"))).toList();
        Map<String, Object> selected = creditCode == null || creditCode.isBlank()
                ? exact.size() == 1 ? exact.get(0) : null
                : exact.stream().filter(item -> creditCode.equals(item.get("creditCode"))).findFirst().orElse(null);
        String result = "NEEDS_REVIEW";
        String message = "匹配到多家同名或近似企业，请使用更精确的企业名称后重试";
        if (selected != null) {
            result = String.valueOf(selected.get("survivalResult"));
            message = "企查查登记状态：" + Optional.ofNullable(selected.get("registrationStatus")).orElse("未知");
        } else if (candidates.isEmpty() && search.path("items").isEmpty()) {
            result = "NOT_FOUND";
            message = "企查查未找到该企业";
        } else if (candidates.size() == 1) {
            message = "仅匹配到近似企业：" + candidates.get(0).get("name");
        }
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("name", name.trim());
        if (creditCode != null && !creditCode.isBlank()) query.put("creditCode", creditCode);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("query", query);
        response.put("result", result);
        response.put("message", message);
        response.put("registrationStatus", selected == null ? null : selected.get("registrationStatus"));
        response.put("creditCode", selected == null ? null : selected.get("creditCode"));
        response.put("keyNo", selected == null ? null : selected.get("keyNo"));
        response.put("candidates", candidates);
        response.put("verifiedAt", now());
        return response;
    }

    private JsonNode fuzzySearch(String endpoint, String apiKey, String apiSecret, String name) {
        try {
            String timespan = String.valueOf(java.time.Instant.now().getEpochSecond());
            String token = md5(apiKey + timespan + apiSecret);
            URI uri = UriComponentsBuilder.fromHttpUrl(endpoint)
                    .queryParam("key", apiKey).queryParam("timespan", timespan).queryParam("token", token)
                    .queryParam("searchKey", name).build(true).toUri();
            HttpResponse<String> response = httpClient.send(HttpRequest.newBuilder(uri)
                    .timeout(java.time.Duration.ofSeconds(Long.parseLong(
                            System.getenv().getOrDefault("QCC_TIMEOUT_MS", "8000"))))
                    .header("Accept", "application/json").GET().build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ApiException(502, "PRODUCTION_502_BAD_GATEWAY", "企查查接口返回 HTTP " + response.statusCode(),
                        "检查接口套餐、额度和服务状态后重试");
            }
            JsonNode payload = objectMapper.readTree(response.body());
            String status = payload.path("Status").asText(payload.path("status").asText(""));
            String providerMessage = payload.path("Message").asText(payload.path("message").asText(""));
            if (!"200".equals(status)) {
                throw new ApiException(502, "PRODUCTION_502_BAD_GATEWAY",
                        providerMessage.isBlank() ? "企查查业务返回状态 " + status : providerMessage,
                        "检查 API Key、Secret Key、接口权限和调用额度后重试");
            }
            java.util.List<JsonNode> records = new ArrayList<>();
            JsonNode direct = payload.path("Result");
            if (direct.isArray()) direct.forEach(records::add);
            else if (direct.path("Result").isArray()) direct.path("Result").forEach(records::add);
            ArrayNode items = objectMapper.createArrayNode();
            for (JsonNode record : records) {
                String itemName = text(record, "Name", "name", "CompanyName");
                if (itemName.isBlank()) continue;
                String registrationStatus = text(record, "Status", "status", "RegistrationStatus");
                ObjectNode candidate = items.addObject();
                candidate.put("keyNo", text(record, "KeyNo", "keyNo", "Id"));
                candidate.put("name", itemName);
                candidate.put("creditCode", text(record, "CreditCode", "creditCode", "UnifiedSocialCreditCode"));
                candidate.put("legalRepresentative", text(record, "OperName", "Oper", "LegalRepresentative"));
                candidate.put("registrationStatus", registrationStatus);
                candidate.put("establishedOn", text(record, "StartDate", "CheckDate", "EstablishedOn"));
                candidate.put("survivalResult", survivalResult(registrationStatus));
            }
            ObjectNode result = objectMapper.createObjectNode();
            result.put("provider", "qichacha").put("endpoint", endpoint).put("providerStatus", status)
                    .put("providerMessage", providerMessage).put("total", items.size());
            result.set("items", items);
            return result;
        } catch (ApiException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ApiException(502, "PRODUCTION_502_BAD_GATEWAY", "企查查企业模糊搜索请求失败",
                    "检查网络、接口地址和企业名称后重试");
        } catch (Exception exception) {
            throw new ApiException(502, "PRODUCTION_502_BAD_GATEWAY", "企查查企业模糊搜索请求失败",
                    "检查网络、接口地址和企业名称后重试", null, Map.of("cause", String.valueOf(exception.getMessage())));
        }
    }

    private String survivalResult(String status) {
        if (status == null || status.isBlank()) return "NEEDS_REVIEW";
        if (status.matches(".*(存续|在业|在营|开业|在册).*")) return "SURVIVING";
        if (status.matches(".*(注销|吊销|清算|停业|关闭|已解散).*")) return "NOT_SURVIVING";
        return "NEEDS_REVIEW";
    }

    private String text(JsonNode value, String... fields) {
        for (String field : fields) {
            String result = value.path(field).asText("").trim();
            if (!result.isBlank()) return result;
        }
        return "";
    }

    private String md5(String value) throws Exception {
        byte[] digest = MessageDigest.getInstance("MD5").digest(value.getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(digest);
    }

    private ResponseEntity<?> command(
            RequestContext context, String type, Object input, java.util.function.Supplier<Command> work
    ) {
        if (context.idempotencyKey() == null || context.idempotencyKey().isBlank()) {
            throw bad("写操作缺少幂等键", "提供 X-Idempotency-Key 后重试");
        }
        String hash = hash(input);
        return store.transaction(() -> {
            Optional<com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord> replay =
                    store.idempotency(context.tenantId(), type, context.idempotencyKey());
            if (replay.isPresent()) {
                if (!replay.get().requestHash().equals(hash)) {
                    throw new ApiException(409, "PRODUCTION_409_IDEMPOTENCY_CONFLICT",
                            "幂等键已用于不同请求", "为新业务操作使用新的幂等键");
                }
                Integer version = version(replay.get().body());
                ResponseEntity.BodyBuilder builder = ResponseEntity.status(replay.get().statusCode())
                        .header("X-Trace-Id", context.traceId()).header("X-Idempotent-Replay", "true");
                if (version != null) builder = builder.eTag("\"" + version + "\"");
                return builder.body(replay.get().body());
            }
            Command result = work.get();
            store.saveIdempotency(context.tenantId(), type, context.idempotencyKey(), hash,
                    result.status(), result.body());
            Integer version = version(result.body());
            ResponseEntity.BodyBuilder builder = ResponseEntity.status(result.status())
                    .header("X-Trace-Id", context.traceId());
            if (version != null) builder = builder.eTag("\"" + version + "\"");
            return builder.body(result.body());
        });
    }

    private Integer version(Object body) {
        if (!(body instanceof Map<?, ?> map)) return null;
        Object value = map.containsKey("supplier") ? map.get("supplier")
                : map.containsKey("customer") ? map.get("customer")
                : map.containsKey("riskEvent") ? map.get("riskEvent") : null;
        if (value instanceof Supplier supplier) return supplier.version();
        if (value instanceof Customer customer) return customer.version();
        if (value instanceof RiskEvent event) return event.version();
        return null;
    }
    private void validateSupplier(JsonNode input, boolean patch) {
        if (!patch) {
            requireText(input, "supplierNo", 100);
            requireText(input, "name", 200);
        } else if (!input.isObject() || input.isEmpty()) {
            throw bad("至少提供一个更新字段", "检查请求字段后重试");
        }
        optionalText(input, "creditCode", 100);
        optionalText(input, "type", 100);
        optionalText(input, "category", 100);
        optionalText(input, "qualification", 500);
        optionalEnum(input, "rating", Set.of("A", "B", "C", "D"));
        optionalEnum(input, "riskLevel", LEVELS);
        optionalText(input, "owner", 100);
        if (input.has("cooperationCount") && (!input.get("cooperationCount").isInt()
                || input.get("cooperationCount").asInt() < 0)) throw bad("cooperationCount 不合法", "检查请求字段后重试");
        optionalText(input, "totalAmount", 50);
        if (input.has("admittance") && !input.get("admittance").isBoolean()) throw bad("admittance 不合法", "检查请求字段后重试");
        optionalEnum(input, "status", Set.of("active", "suspended", "blacklisted"));
        if (input.has("metadata") && !input.get("metadata").isObject()) throw bad("metadata 不合法", "检查请求字段后重试");
        optionalText(input, "remark", 500);
    }
    private void validateCustomer(JsonNode input, boolean patch) {
        if (!patch) {
            requireText(input, "customerNo", 100);
            requireText(input, "name", 200);
        } else if (!input.isObject() || input.isEmpty()) {
            throw bad("至少提供一个更新字段", "检查请求字段后重试");
        }
        optionalText(input, "creditCode", 100);
        optionalText(input, "legalRepresentative", 100);
        optionalText(input, "operationStatus", 100);
        optionalText(input, "businessStatus", 100);
        optionalText(input, "enterpriseSize", 50);
        optionalText(input, "industry", 100);
        optionalText(input, "revenue", 50);
        optionalText(input, "receivable", 50);
        if (input.has("overdueDays") && (!input.get("overdueDays").isInt()
                || input.get("overdueDays").asInt() < 0)) throw bad("overdueDays 不合法", "检查请求字段后重试");
        optionalEnum(input, "exposureLevel", LEVELS);
        optionalEnum(input, "pressureLevel", LEVELS);
        optionalText(input, "role", 100);
        if (input.has("alerts") && !input.get("alerts").isArray()) throw bad("alerts 不合法", "检查请求字段后重试");
        optionalEnum(input, "status", Set.of("active", "frozen", "blacklisted"));
        if (input.has("metadata") && !input.get("metadata").isObject()) throw bad("metadata 不合法", "检查请求字段后重试");
        optionalText(input, "remark", 500);
    }
    private void validateRisk(JsonNode input, boolean patch) {
        if (!patch) {
            requireText(input, "companyName", 200);
            requireEnum(input, "companyType", Set.of("customer", "supplier"));
            requireText(input, "riskType", 200);
            requireEnum(input, "riskLevel", Set.of("低风险", "中风险", "高风险"));
        } else if (!input.isObject() || input.isEmpty()) {
            throw bad("至少提供一个更新字段", "检查请求字段后重试");
        } else {
            optionalEnum(input, "companyType", Set.of("customer", "supplier"));
            optionalEnum(input, "riskLevel", Set.of("低风险", "中风险", "高风险"));
        }
        optionalText(input, "owner", 100);
        optionalText(input, "action", 500);
        optionalEnum(input, "status", Set.of("active", "processing", "resolved", "ignored"));
        if (input.has("metadata") && !input.get("metadata").isObject()) throw bad("metadata 不合法", "检查请求字段后重试");
        optionalText(input, "remark", 500);
    }
    private void requireVersion(RequestContext context, int actual) {
        if (context.expectedVersion() == null) {
            throw new ApiException(409, "PRODUCTION_409_VERSION_CONFLICT", "缺少聚合版本",
                    "刷新数据并携带最新 If-Match 后重试", List.of(), Map.of("actualVersion", actual));
        }
        if (context.expectedVersion() != actual) {
            throw versionConflict(Map.of("expectedVersion", context.expectedVersion(), "actualVersion", actual));
        }
    }
    private void audit(RequestContext context, String aggregateType, String aggregateId, int version,
                       String action, Object before, Object after) {
        store.addAuditLog(new AuditLog(UUID.randomUUID().toString(), context.tenantId(), aggregateType,
                aggregateId, version, action, context.actorId(), before, after, UUID.randomUUID().toString(),
                context.traceId(), now()));
    }
    private void outbox(RequestContext context, String type, String aggregateType, String aggregateId,
                        int version, Map<String, Object> payload) {
        store.addOutbox(new OutboxEvent(UUID.randomUUID().toString(), context.tenantId(), type, aggregateType,
                aggregateId, version, UUID.randomUUID().toString(), context.traceId(), payload, "PENDING",
                0, "", now()));
    }
    private RequestContext require(HttpServletRequest request, String permission) {
        RequestContext context = contexts.from(request);
        if (!context.has(permission)) {
            throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED", "缺少操作权限：" + permission,
                    "请联系管理员授予对应供应链权限");
        }
        return context;
    }
    private void validatePage(Integer page, Integer pageSize) {
        if (page != null && page < 1) throw bad("页码必须大于等于 1", "检查请求字段后重试");
        if (pageSize != null && (pageSize < 1 || pageSize > 200)) throw bad("每页数量必须在 1-200 之间", "检查请求字段后重试");
    }
    private void enums(String value, Set<String> values, String field) {
        if (value != null && !values.contains(value)) throw bad(field + " 不合法", "检查请求字段后重试");
    }
    private void requireEnum(JsonNode input, String field, Set<String> values) {
        if (!input.hasNonNull(field) || !values.contains(input.get(field).asText())) {
            throw bad(field + " 不合法", "检查请求字段后重试");
        }
    }
    private void optionalEnum(JsonNode input, String field, Set<String> values) {
        if (input.hasNonNull(field) && !values.contains(input.get(field).asText())) {
            throw bad(field + " 不合法", "检查请求字段后重试");
        }
    }
    private void requireText(JsonNode input, String field, int maxLength) {
        if (!input.hasNonNull(field)) throw bad(field + " 不合法", "检查请求字段后重试");
        if (input.get(field).asText().isBlank() || input.get(field).asText().length() > maxLength) {
            throw bad(field + " 不合法", "检查请求字段后重试");
        }
    }
    private void optionalText(JsonNode input, String field, int maxLength) {
        if (input.hasNonNull(field) && input.get(field).asText().length() > maxLength) {
            throw bad(field + " 不合法", "检查请求字段后重试");
        }
    }
    private Map<String, Object> metadata(JsonNode input) {
        if (!input.hasNonNull("metadata")) return Map.of();
        return objectMapper.convertValue(input.get("metadata"), new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
    }
    private List<String> stringList(JsonNode value) {
        List<String> result = new ArrayList<>();
        if (value != null && value.isArray()) value.forEach(item -> result.add(item.asText()));
        return result;
    }
    private String hash(Object value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(objectMapper.writeValueAsBytes(value)));
        } catch (Exception exception) { throw new IllegalStateException(exception); }
    }
    private String patchText(JsonNode patch, String field, String fallback) {
        return patch.has(field) ? patch.get(field).asText() : fallback;
    }
    private int patchInt(JsonNode patch, String field, int fallback) {
        return patch.has(field) ? patch.get(field).asInt() : fallback;
    }
    private String text(JsonNode input, String field) { return input.get(field).asText(); }
    private String textOr(JsonNode input, String field, String fallback) {
        return input.hasNonNull(field) ? input.get(field).asText() : fallback;
    }
    private String textOrEmpty(JsonNode input, String field) { return textOr(input, field, ""); }
    private Supplier getSupplier(String tenantId, String id) {
        return store.supplier(tenantId, id).orElseThrow(() -> notFound("供应商不存在", "刷新供应商列表后重试"));
    }
    private Customer getCustomer(String tenantId, String id) {
        return store.customer(tenantId, id).orElseThrow(() -> notFound("客户不存在", "刷新客户列表后重试"));
    }
    private RiskEvent getRisk(String tenantId, String id) {
        return store.riskEvent(tenantId, id).orElseThrow(() -> notFound("风险事件不存在", "刷新风险事件列表后重试"));
    }
    private String riskNo() {
        return "RISK-" + LocalDate.now(ZoneOffset.UTC).toString().replace("-", "")
                + "-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
    }
    private String now() { return Instant.now().toString(); }
    private void validateUuid(String value) {
        try { UUID.fromString(value); } catch (RuntimeException exception) {
            throw bad("ID 必须是 UUID", "检查请求字段后重试");
        }
    }
    private ApiException bad(String message, String suggestion) {
        return new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", message, suggestion);
    }
    private ApiException conflict(String message, String suggestion) {
        return new ApiException(409, "PRODUCTION_409_ILLEGAL_STATE", message, suggestion);
    }
    private ApiException versionConflict(Map<String, Object> details) {
        return new ApiException(409, "PRODUCTION_409_VERSION_CONFLICT", "数据已被其他操作更新",
                "刷新数据后重新确认操作", List.of(), details);
    }
    private ApiException notFound(String message, String suggestion) {
        return new ApiException(404, "PRODUCTION_404_NOT_FOUND", message, suggestion);
    }
}
