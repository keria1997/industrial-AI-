package com.wanshen.platform.production;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.auth.TokenService;
import com.wanshen.platform.web.ApiExceptionHandler;
import com.wanshen.platform.web.RequestContextService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ProductionControllerTests {
    private MockMvc mockMvc;
    private ObjectMapper objectMapper;
    private String adminToken;
    private String reviewerToken;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        TokenService tokenService = new TokenService("test-secret", objectMapper);
        RequestContextService contexts = new RequestContextService(tokenService);
        ProductionStore store = new ProductionStore();
        var inventory = new com.wanshen.platform.fulfillment.FulfillmentStore();
        ProductionService production = new ProductionService(store, objectMapper);
        production.setInventoryPort(new com.wanshen.platform.fulfillment.ProductionInventoryAdapter(inventory, objectMapper));
        store.bomSnapshots.put("TENANT-SHWS:FG001", objectMapper.createObjectNode()
                .put("id", "bom-1").put("routingSnapshotId", "routing-1")
                .set("lines", objectMapper.createArrayNode().add(objectMapper.createObjectNode()
                        .put("materialId", "RM1").put("qtyPer", "1").put("uom", "PCS").put("warehouseId", "WH1"))));
        inventory.saveAvailability(objectMapper.createObjectNode().put("tenantId", "TENANT-SHWS")
                .put("warehouseId", "WH1").put("productId", "RM1").put("uom", "PCS").put("fulfillableQty", "100")
                .put("qualifiedOnHandQty", "100").put("allocatedReservedQty", "0").put("factVersion", 1));
        mockMvc = MockMvcBuilders.standaloneSetup(new ProductionController(
                production, contexts, objectMapper
        )).setControllerAdvice(new ApiExceptionHandler()).build();
        adminToken = tokenService.issue("admin", "系统管理员", "超级管理员",
                List.of("TENANT-SHWS"), List.of("*"), "development-session-v1").accessToken();
        reviewerToken = tokenService.issue("reviewer", "计划审核员", "生产主管",
                List.of("TENANT-SHWS"), List.of("*"), "development-session-v1").accessToken();
    }

    @Test
    void readinessRequiresAuthenticationAndReturnsProductionModule() throws Exception {
        mockMvc.perform(get("/api/v1/production/readiness")
                        .header("Authorization", "Bearer " + adminToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.module").value("production"));
    }

    @Test
    void createsReplaysAndAdvancesDemandThroughMrp() throws Exception {
        String createBody = """
                {
                  "code": "DM-JAVA-001",
                  "sourceType": "MANUAL",
                  "productId": "FG001",
                  "qty": "10",
                  "uom": "PCS",
                  "dueDate": "2026-11-30",
                  "factoryResourceId": "FACT-01"
                }
                """;
        MvcResult created = mockMvc.perform(post("/api/v1/production/demands")
                        .header("Authorization", "Bearer " + adminToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "demand-create-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody)
                )
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("RECEIVED"))
                .andExpect(header().string("ETag", "\"1\""))
                .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString()).path("id").asText();

        mockMvc.perform(post("/api/v1/production/demands")
                        .header("Authorization", "Bearer " + adminToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "demand-create-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody)
                )
                .andExpect(status().isCreated())
                .andExpect(header().string("X-Idempotent-Replay", "true"));

        mockMvc.perform(post("/api/v1/production/demands/" + id + "/validate")
                        .header("Authorization", "Bearer " + adminToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "demand-validate-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}")
                )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING_REVIEW"));

        mockMvc.perform(post("/api/v1/production/demands/" + id + "/approve")
                        .header("Authorization", "Bearer " + adminToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "demand-approve-self")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}")
                )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.approvedBy").value("admin"));

        mockMvc.perform(post("/api/v1/production/demands/" + id + "/claim")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "demand-claim-1")
                )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handlerId").value("reviewer"));

        mockMvc.perform(post("/api/v1/production/mrp-runs")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "mrp-run-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"demandIds\":[\"" + id + "\"]}")
                )
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("SUCCEEDED"))
                .andExpect(jsonPath("$.result.canProceedToAps").value(true));
    }
}
