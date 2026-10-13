package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.auth.TokenService;
import com.wanshen.platform.web.ApiExceptionHandler;
import com.wanshen.platform.web.RequestContextService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class FulfillmentControllerTests {
    private MockMvc mockMvc;
    private ObjectMapper objectMapper;
    private String token;
    private String reviewerToken;
    private String makerToken;
    private String makerSelfApproveToken;
    private String deliveryDate;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        TokenService tokenService = new TokenService("test-secret", objectMapper);
        RequestContextService contexts = new RequestContextService(tokenService);
        service = new FulfillmentService(new FulfillmentStore(), objectMapper, "test-key",
                "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY");
        mockMvc = MockMvcBuilders.standaloneSetup(new FulfillmentController(service, contexts, objectMapper))
                .setControllerAdvice(new ApiExceptionHandler()).build();
        token = tokenService.issue("admin", "系统管理员", "超级管理员", List.of("TENANT-SHWS"),
                List.of("*"), "development-session-v1").accessToken();
        reviewerToken = tokenService.issue("reviewer", "审核员", "销售主管", List.of("TENANT-SHWS"),
                List.of("*"), "development-session-v1").accessToken();
        makerToken = tokenService.issue("maker", "制单人", "销售专员", List.of("TENANT-SHWS"),
                List.of("sales.order.read", "sales.order.create", "sales.order.review.decide"),
                "development-session-v1").accessToken();
        makerSelfApproveToken = tokenService.issue("maker-admin", "授权制单人", "销售主管",
                List.of("TENANT-SHWS"),
                List.of("sales.order.read", "sales.order.create", "sales.order.review.decide",
                        "sales.order.review.self-approve"),
                "development-session-v1").accessToken();
        deliveryDate = LocalDate.now(ZoneOffset.UTC).plusDays(7).toString();
    }

    private FulfillmentService service;

    @Test
    void listsTenantStockAndResolvesWarehouseCodesWithPermissionAndInputChecks() throws Exception {
        var store = service.repository();
        SalesShipmentWorkflowTests.stock(service, "TENANT-SHWS", "FG-0", "5", "0");
        InventoryWarehouseFactsTests.warehouse(store, "TENANT-SHWS");
        SalesShipmentWorkflowTests.stock(service, "other-tenant", "FG-0", "99", "0");
        mockMvc.perform(get("/api/v1/inventory/availability")
                        .header("Authorization", "Bearer " + token).header("X-Tenant-Id", "TENANT-SHWS"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].warehouseId").value("server-wh-id"))
                .andExpect(jsonPath("$[0].qualifiedOnHandQty").value("5"));
        for (String id : List.of("WH-TEST", "server-wh-id")) {
            mockMvc.perform(get("/api/v1/inventory/availability").param("warehouseId", id)
                            .header("Authorization", "Bearer " + token).header("X-Tenant-Id", "TENANT-SHWS"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        }
        mockMvc.perform(get("/api/v1/inventory/availability").param("productIds", "missing")
                        .header("Authorization", "Bearer " + token).header("X-Tenant-Id", "TENANT-SHWS"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/v1/inventory/availability")
                        .header("Authorization", "Bearer " + makerToken).header("X-Tenant-Id", "TENANT-SHWS"))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/inventory/availability").param("warehouseId", "")
                        .header("Authorization", "Bearer " + token).header("X-Tenant-Id", "TENANT-SHWS"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void listsLegacyOrderMissingRecipient() throws Exception {
        ObjectNode order = objectMapper.createObjectNode();
        order.put("id", "legacy-order").put("tenantId", "TENANT-SHWS")
                .put("orderNo", "SO-LEGACY-001").put("updatedAt", "2026-10-01T00:00:00Z");
        service.repository().orders.put(FulfillmentStore.key("TENANT-SHWS", "legacy-order"), order);

        mockMvc.perform(get("/api/v1/sales/sales-orders")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].orderNo").value("SO-LEGACY-001"));
    }

    @Test
    void createsReplaysReviewsConfirmsAndCancelsOrders() throws Exception {
        String body = """
                {
                  "customerId": "CUST-001",
                  "ownerEmployeeId": "admin",
                  "fulfillmentWarehouseId": "WH-01",
                  "factoryResourceId": "FACT-01",
                  "requestedDeliveryDate": "%s",
                  "allowPartialShipment": false,
                  "currency": "CNY",
                  "recipient": {
                    "name": "张三", "phone": "13800138000", "country": "中国",
                    "province": "上海", "city": "上海", "address": "浦东新区世纪大道 100 号"
                  },
                  "lines": [{
                    "lineNo": 1, "productId": "FG-001", "orderedQty": "2", "uom": "PCS",
                    "unitPrice": "100", "taxRate": "0.13", "promisedDate": "%s",
                    "allowPartialShipment": false
                  }]
                }
                """.formatted(deliveryDate, deliveryDate);
        MvcResult created = mockMvc.perform(post("/api/v1/sales/sales-orders")
                        .header("Authorization", "Bearer " + makerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "order-create-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.overallStatus").value("PENDING_CONFIRMATION"))
                .andExpect(jsonPath("$.recipient.phoneMasked").value("138****8000"))
                .andExpect(header().string("ETag", "\"1\""))
                .andReturn();
        JsonNode order = objectMapper.readTree(created.getResponse().getContentAsString());
        String id = order.path("id").asText();

        mockMvc.perform(post("/api/v1/sales/sales-orders")
                        .header("Authorization", "Bearer " + makerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "order-create-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(header().string("X-Idempotent-Replay", "true"));

        mockMvc.perform(post("/api/v1/sales/sales-orders/" + id + "/review-decisions")
                        .header("Authorization", "Bearer " + makerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "review-self")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"APPROVE\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/v1/sales/sales-orders/" + id + "/review-decisions")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "review-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"APPROVE\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reviewStatus").value("APPROVED"))
                .andExpect(header().string("ETag", "\"2\""));

        mockMvc.perform(post("/api/v1/sales/sales-orders/" + id + "/confirm")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "2")
                        .header("X-Idempotency-Key", "confirm-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestedDeliveryDate\":\"" + deliveryDate + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overallStatus").value("CONFIRMED"))
                .andExpect(header().string("ETag", "\"3\""));

        mockMvc.perform(post("/api/v1/sales/sales-orders/" + id + "/cancel")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "3")
                        .header("X-Idempotency-Key", "cancel-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"test\"}"))
                .andExpect(status().isConflict());

        JsonNode line = order.withArray("lines").get(0);
        String shipmentBody = """
                {
                  "warehouseId": "WH-01",
                  "lines": [{"orderLineId":"%s","sourceLineRevision":2,"requestedQty":"2","uom":"PCS"}]
                }
                """.formatted(line.path("id").asText());
        mockMvc.perform(post("/api/v1/sales/sales-orders/" + id + "/shipment-requests")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "3")
                        .header("X-Idempotency-Key", "shipment-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(shipmentBody))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.workflowStatus").value("REQUESTED"));
        assertThat(service.repository().shipmentTasks).hasSize(1);

        mockMvc.perform(get("/api/v1/sales/sales-orders/" + id + "/fulfillment-trace")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.salesOrderId").value(id))
                .andExpect(jsonPath("$.events.length()").value(5));

        String availabilityBody = """
                {
                  "eventId":"11111111-1111-4111-8111-111111111111",
                  "warehouseId":"WH-01",
                  "productId":"FG-001",
                  "qualifiedOnHandQty":"10",
                  "allocatedReservedQty":"0",
                  "frozenQty":"0",
                  "safetyStockQty":"0",
                  "inTransitQty":"0",
                  "fulfillableQty":"10",
                  "uom":"PCS",
                  "formulaVersion":"FULFILLABLE-V1",
                  "factVersion":1,
                  "sourceSystem":"TEST",
                  "asOf":"2026-10-12T00:00:00Z"
                }
                """;
        mockMvc.perform(post("/api/v1/inventory/internal/availability-events")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(availabilityBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projectionResult").value("INSERTED"));

        mockMvc.perform(get("/api/v1/inventory/availability")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .param("warehouseId", "WH-01")
                        .param("productIds", "FG-001"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].fulfillableQty").value("10"));

        JsonNode shipment = service.repository().shipmentRequests.values().iterator().next();
        JsonNode task = service.repository().shipmentTasks.values().iterator().next();
        String reserveBody = """
                {
                  "shipmentRequestId":"%s",
                  "orderRevision":3,
                  "expectedFactVersions":[{"productId":"FG-001","factVersion":1}]
                }
                """.formatted(shipment.path("id").asText());
        MvcResult reserved = mockMvc.perform(post("/api/v1/inventory/shipment-tasks/"
                                + task.path("id").asText() + "/check-and-reserve")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "reserve-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reserveBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("RESERVED"))
                .andExpect(jsonPath("$.outbound.status").value("RESERVED"))
                .andReturn();
        JsonNode reserveResult = objectMapper.readTree(reserved.getResponse().getContentAsString());
        JsonNode reservation = reserveResult.get("reservation");
        JsonNode outbound = reserveResult.get("outbound");

        mockMvc.perform(get("/api/v1/inventory/reservations/" + reservation.path("id").asText())
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(header().string("ETag", "\"1\""));

        String outboundBody = """
                {
                  "lines":[{"outboundLineId":"%s","qty":"2","uom":"PCS"}],
                  "shippedAt":"2026-10-12T08:00:00Z"
                }
                """.formatted(outbound.withArray("lines").get(0).path("id").asText());
        mockMvc.perform(post("/api/v1/inventory/outbounds/" + outbound.path("id").asText() + "/post")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "outbound-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(outboundBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("POSTED"))
                .andExpect(jsonPath("$.outbound.status").value("POSTED"));

        mockMvc.perform(get("/api/v1/inventory/transactions")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .param("warehouseId", "WH-01").param("type", "SALES_OUTBOUND"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].qty").value("2"));

        assertThat(service.repository().shipmentTasks.values().iterator().next().path("workflowStatus").asText())
                .isEqualTo("COMPLETED");
        assertThat(id).isNotBlank();
    }

    @Test
    void creatorWithSelfApprovalPermissionCanApproveOwnOrder() throws Exception {
        String body = """
                {
                  "customerId": "CUST-SELF",
                  "ownerEmployeeId": "maker-admin",
                  "fulfillmentWarehouseId": "WH-01",
                  "factoryResourceId": "FACT-01",
                  "requestedDeliveryDate": "%s",
                  "allowPartialShipment": false,
                  "currency": "CNY",
                  "recipient": {
                    "name": "张三", "phone": "13800138000", "country": "中国",
                    "province": "上海", "city": "上海", "address": "浦东新区世纪大道 100 号"
                  },
                  "lines": [{
                    "lineNo": 1, "productId": "FG-SELF", "orderedQty": "1", "uom": "PCS",
                    "unitPrice": "100", "taxRate": "0", "promisedDate": "%s",
                    "allowPartialShipment": false
                  }]
                }
                """.formatted(deliveryDate, deliveryDate);
        MvcResult created = mockMvc.perform(post("/api/v1/sales/sales-orders")
                        .header("Authorization", "Bearer " + makerSelfApproveToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "self-approval-order")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn();
        String orderId = objectMapper.readTree(created.getResponse().getContentAsString()).path("id").asText();

        mockMvc.perform(post("/api/v1/sales/sales-orders/" + orderId + "/review-decisions")
                        .header("Authorization", "Bearer " + makerSelfApproveToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "self-approval-review")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"APPROVE\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reviewStatus").value("APPROVED"))
                .andExpect(header().string("ETag", "\"2\""));
    }

    @Test
    void updatesPendingOrderAndPaginatesList() throws Exception {
        String body = """
                {
                  "customerId": "CUST-002", "ownerEmployeeId": "admin",
                  "fulfillmentWarehouseId": "WH-01", "factoryResourceId": "FACT-01",
                  "requestedDeliveryDate": "%s", "allowPartialShipment": true, "currency": "CNY",
                  "recipient": {"name":"李四","phone":"13900139000","country":"中国","province":"上海","city":"上海","address":"徐汇区"},
                  "lines": [{"lineNo":1,"productId":"FG-002","orderedQty":"3","uom":"PCS","unitPrice":"10","taxRate":"0","promisedDate":"%s","allowPartialShipment":true}]
                }
                """.formatted(deliveryDate, deliveryDate);
        MvcResult created = mockMvc.perform(post("/api/v1/sales/sales-orders")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "order-update-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString()).path("id").asText();
        String patch = """
                {"customerName":"客户二","lines":[{"lineNo":1,"productId":"FG-002","orderedQty":"5","uom":"PCS","unitPrice":"12","taxRate":"0.13","promisedDate":"%s","allowPartialShipment":true}]}
                """.formatted(deliveryDate);
        mockMvc.perform(patch("/api/v1/sales/sales-orders/" + id)
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "order-update-2")
                        .contentType(MediaType.APPLICATION_JSON).content(patch))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customerName").value("客户二"))
                .andExpect(jsonPath("$.lines[0].orderedQty").value("5"))
                .andExpect(jsonPath("$.version").value(2));
        mockMvc.perform(get("/api/v1/sales/sales-orders")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .param("page", "1").param("pageSize", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void managesWarehouseAndProductMasterData() throws Exception {
        MvcResult warehouseResult = mockMvc.perform(post("/api/v1/inventory/warehouses")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "warehouse-create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"WH-MASTER\",\"name\":\"主数据仓\",\"type\":\"standard\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.warehouse.code").value("WH-MASTER"))
                .andExpect(header().string("ETag", "\"1\""))
                .andReturn();
        String warehouseId = objectMapper.readTree(warehouseResult.getResponse().getContentAsString())
                .path("warehouse").path("id").asText();

        mockMvc.perform(patch("/api/v1/inventory/warehouses/" + warehouseId)
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "warehouse-update")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"已更新仓库\",\"status\":\"inactive\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.warehouse.name").value("已更新仓库"))
                .andExpect(jsonPath("$.warehouse.status").value("inactive"))
                .andExpect(header().string("ETag", "\"2\""));

        mockMvc.perform(get("/api/v1/inventory/warehouses/" + warehouseId)
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS"))
                .andExpect(status().isOk())
                .andExpect(header().string("ETag", "\"2\""));

        mockMvc.perform(delete("/api/v1/inventory/warehouses/" + warehouseId)
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "2")
                        .header("X-Idempotency-Key", "warehouse-delete"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deleted").value(true));

        MvcResult productResult = mockMvc.perform(post("/api/v1/inventory/products")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "product-create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"FG-MASTER\",\"name\":\"主数据产品\",\"uom\":\"PCS\",\"unitPrice\":\"1200\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.product.uom").value("PCS"))
                .andExpect(jsonPath("$.product.unitPrice").value("1200"))
                .andExpect(header().string("ETag", "\"1\""))
                .andReturn();
        String productId = objectMapper.readTree(productResult.getResponse().getContentAsString())
                .path("product").path("id").asText();

        mockMvc.perform(patch("/api/v1/inventory/products/" + productId)
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "product-price-update")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"unitPrice\":\"1250\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.product.unitPrice").value("1250"))
                .andExpect(header().string("ETag", "\"2\""));
    }

    @Test
    void transfersAndAdjustsInventoryFacts() throws Exception {
        mockMvc.perform(post("/api/v1/inventory/internal/availability-events")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(availability("event-transfer", "WH-FROM", "FG-MOVE", "10")))
                .andExpect(status().isOk());

        MvcResult created = mockMvc.perform(post("/api/v1/inventory/transfer-orders")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "transfer-create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fromWarehouseId":"WH-FROM","toWarehouseId":"WH-TO","productId":"FG-MOVE",
                                 "transferQty":"4","uom":"PCS"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.transfer.status").value("DRAFT"))
                .andExpect(header().string("ETag", "\"1\""))
                .andReturn();
        String transferId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("transfer").path("id").asText();

        mockMvc.perform(post("/api/v1/inventory/transfer-orders/" + transferId + "/approve")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "transfer-approve"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.transfer.status").value("APPROVED"))
                .andExpect(header().string("ETag", "\"2\""));

        mockMvc.perform(post("/api/v1/inventory/transfer-orders/" + transferId + "/ship")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "2")
                        .header("X-Idempotency-Key", "transfer-ship")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"externalTransactionId\":\"TRANSFER-SHIP-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.transfer.status").value("IN_TRANSIT"))
                .andExpect(jsonPath("$.availability.fulfillableQty").value("6"));

        mockMvc.perform(post("/api/v1/inventory/transfer-orders/" + transferId + "/receive")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "3")
                        .header("X-Idempotency-Key", "transfer-receive")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"externalTransactionId\":\"TRANSFER-RECEIVE-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.transfer.status").value("RECEIVED"))
                .andExpect(jsonPath("$.availability.fulfillableQty").value("4"));

        mockMvc.perform(get("/api/v1/inventory/transactions")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .param("productId", "FG-MOVE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2));

        mockMvc.perform(post("/api/v1/inventory/internal/availability-events")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(availability("event-stocktake", "WH-COUNT", "FG-COUNT", "7")))
                .andExpect(status().isOk());

        MvcResult stocktakeCreated = mockMvc.perform(post("/api/v1/inventory/stocktake-tasks")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "stocktake-create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"warehouseId":"WH-COUNT",
                                 "lines":[{"productId":"FG-COUNT","systemQty":"7","uom":"PCS"}]}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.stocktake.status").value("DRAFT"))
                .andExpect(header().string("ETag", "\"1\""))
                .andReturn();
        JsonNode stocktake = objectMapper.readTree(stocktakeCreated.getResponse().getContentAsString())
                .path("stocktake");
        String stocktakeId = stocktake.path("id").asText();
        String lineId = stocktake.withArray("lines").get(0).path("id").asText();

        mockMvc.perform(post("/api/v1/inventory/stocktake-tasks/" + stocktakeId + "/approve")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "stocktake-approve"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stocktake.status").value("APPROVED"));

        mockMvc.perform(post("/api/v1/inventory/stocktake-tasks/" + stocktakeId + "/start")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "2")
                        .header("X-Idempotency-Key", "stocktake-start"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stocktake.status").value("IN_PROGRESS"));

        mockMvc.perform(post("/api/v1/inventory/stocktake-tasks/" + stocktakeId + "/count")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "3")
                        .header("X-Idempotency-Key", "stocktake-count")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lines\":[{\"lineId\":\"" + lineId + "\",\"countedQty\":\"5\"}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stocktake.status").value("COMPLETED"))
                .andExpect(jsonPath("$.stocktake.lines[0].varianceQty").value("-2"));

        mockMvc.perform(post("/api/v1/inventory/stocktake-tasks/" + stocktakeId + "/adjust")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "4")
                        .header("X-Idempotency-Key", "stocktake-adjust")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"externalTransactionId\":\"STOCKTAKE-ADJUST-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stocktake.status").value("COMPLETED"))
                .andExpect(jsonPath("$.stocktake.lines[0].lineStatus").value("ADJUSTED"));

        mockMvc.perform(get("/api/v1/inventory/availability")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .param("warehouseId", "WH-COUNT")
                        .param("productIds", "FG-COUNT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].fulfillableQty").value("5"));
    }

    @Test
    void createsReceiptsAndReturnsPurchaseInventory() throws Exception {
        service.setProductionTaskReader((tenantId, taskId) -> {
            try {
                return Optional.of(objectMapper.readTree("""
                        {"id":"%s","taskType":"MRP_RUN","status":"SUCCEEDED",
                         "result":{"materialShortages":[{
                           "demandId":"DEMAND-001","materialId":"MAT-001","materialName":"钢板",
                           "warehouseId":"WH-PO","shortageQty":"5","uom":"PCS",
                           "requiredDate":"%s"
                         }]}}
                        """.formatted(taskId, deliveryDate)));
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });

        MvcResult requestResult = mockMvc.perform(post("/api/v1/procurement/purchase-requests")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "purchase-request-create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"mrpTaskId":"MRP-001","demandId":"DEMAND-001","materialId":"MAT-001"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING_APPROVAL"))
                .andExpect(header().string("ETag", "\"1\""))
                .andReturn();
        String requestId = objectMapper.readTree(requestResult.getResponse().getContentAsString())
                .path("id").asText();

        mockMvc.perform(post("/api/v1/procurement/purchase-requests/" + requestId + "/approve")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "purchase-request-approve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"supplierId":"SUP-001","supplierName":"供应商一",
                                 "promisedDate":"%s","unitPrice":"10","taxRate":"0.13"}
                                """.formatted(deliveryDate)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.request.status").value("CONVERTED"))
                .andExpect(jsonPath("$.order.totalAmount").value("56.5"));

        mockMvc.perform(get("/api/v1/procurement/purchase-orders")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].status").value("CONFIRMED"));
        JsonNode order = service.repository().purchaseOrders.values().iterator().next();
        String orderId = order.path("id").asText();

        MvcResult receiptResult = mockMvc.perform(post("/api/v1/procurement/purchase-orders/"
                        + orderId + "/receipts")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "purchase-receipt")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"externalTransactionId":"PO-RECEIVE-1",
                                 "receivedAt":"2026-10-12T08:00:00Z"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.order.status").value("RECEIVED"))
                .andExpect(jsonPath("$.availability.fulfillableQty").value("5"))
                .andReturn();
        String receiptId = objectMapper.readTree(receiptResult.getResponse().getContentAsString())
                .path("receipt").path("id").asText();

        mockMvc.perform(post("/api/v1/procurement/purchase-returns")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "purchase-return-create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"purchaseReceiptId":"%s","reason":"质量不良","returnQty":"2"}
                                """.formatted(receiptId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("pending"));
        String returnId = service.repository().purchaseReturns.values().iterator().next()
                .path("id").asText();

        mockMvc.perform(post("/api/v1/procurement/purchase-returns/" + returnId + "/process")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "purchase-return-process")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"externalTransactionId\":\"PO-RETURN-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ret.status").value("done"))
                .andExpect(jsonPath("$.availability.fulfillableQty").value("3"));

        mockMvc.perform(get("/api/v1/procurement/purchase-returns")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void reservesInOperatorSelectedWarehouse() throws Exception {
        String taskId = createConfirmedShipmentTask("selected", "WH-DEFAULT", "2", true);
        String selectedWarehouseId = createActiveWarehouse("WH-SELECTED", "选中仓");
        mockMvc.perform(post("/api/v1/inventory/internal/availability-events")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(availability("selected-fact", selectedWarehouseId, "FG-CLOSE", "3")))
                .andExpect(status().isOk());

        JsonNode task = shipmentTask(taskId);
        MvcResult selectedResult = mockMvc.perform(post("/api/v1/inventory/shipment-tasks/" + taskId + "/check-and-reserve")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "reserve-selected")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"shipmentRequestId":"%s","orderRevision":3,
                                 "warehouseId":"%s",
                                 "expectedFactVersions":[{"productId":"FG-CLOSE","factVersion":1}]}
                                """.formatted(task.path("shipmentRequestId").asText(), selectedWarehouseId)))
                .andReturn();
        assertThat(selectedResult.getResponse().getStatus()).isEqualTo(200);
        assertThat(objectMapper.readTree(selectedResult.getResponse().getContentAsString())
                .path("task").path("warehouseId").asText()).isEqualTo(selectedWarehouseId);
        assertThat(objectMapper.readTree(selectedResult.getResponse().getContentAsString()).path("result").asText())
                .isEqualTo("RESERVED");

        assertThat(service.repository().reservationsByTask("TENANT-SHWS", taskId).get(0)
                .path("warehouseId").asText()).isEqualTo(selectedWarehouseId);
    }

    @Test
    void partiallyPostsThenMarksTaskForRecheckWhenProductionCompletionArrives() throws Exception {
        service.setProductionDemandCreator((context, input) -> objectMapper.createObjectNode()
                .put("id", "DEMAND-" + input.path("productId").asText())
                .put("code", "PD-CLOSE-001"));
        String taskId = createConfirmedShipmentTask("close", "WH-CLOSE", "5", true);
        createActiveWarehouse("WH-CLOSE", "闭环仓");
        mockMvc.perform(post("/api/v1/inventory/internal/availability-events")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(availability("close-fact", "WH-CLOSE", "FG-CLOSE", "4")))
                .andExpect(status().isOk());

        JsonNode task = shipmentTask(taskId);
        MvcResult reservedResult = mockMvc.perform(post("/api/v1/inventory/shipment-tasks/" + taskId + "/check-and-reserve")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "reserve-close")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"shipmentRequestId":"%s","orderRevision":3,"warehouseId":"WH-CLOSE",
                                 "expectedFactVersions":[{"productId":"FG-CLOSE","factVersion":1}]}
                                """.formatted(task.path("shipmentRequestId").asText())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("PARTIALLY_RESERVED"))
                .andReturn();
        JsonNode outbound = objectMapper.readTree(reservedResult.getResponse().getContentAsString())
                .path("outbound").deepCopy();

        MvcResult postedResult = mockMvc.perform(post("/api/v1/inventory/outbounds/" + outbound.path("id").asText() + "/post")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "post-close")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"shippedAt":"2026-10-12T08:00:00Z",
                                 "lines":[{"outboundLineId":"%s","qty":"2","uom":"PCS"}]}
                                """.formatted(outbound.withArray("lines").get(0).path("id").asText())))
                .andReturn();
        assertThat(postedResult.getResponse().getStatus()).isEqualTo(200);
        assertThat(objectMapper.readTree(postedResult.getResponse().getContentAsString()).path("outbound").path("status").asText())
                .isEqualTo("PARTIALLY_POSTED");
        assertThat(shipmentTask(taskId).path("workflowStatus").asText()).isEqualTo("ACTIVE");
        assertThat(service.repository().availability("TENANT-SHWS", "WH-CLOSE", "FG-CLOSE").orElseThrow()
                .path("qualifiedOnHandQty").asText()).isEqualTo("2");

        JsonNode shortLine = shipmentTask(taskId).withArray("lines").get(0);
        mockMvc.perform(post("/api/v1/inventory/shipment-tasks/" + taskId + "/production-requests")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", String.valueOf(shipmentTask(taskId).path("version").asInt()))
                        .header("X-Idempotency-Key", "production-close")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"lines":[{"shipmentRequestLineId":"%s","orderLineId":"%s",
                                 "sourceRevision":1,"factoryResourceId":"FACT-01","dueDate":"%s"}]}
                                """.formatted(shortLine.path("id").asText(), shortLine.path("orderLineId").asText(),
                                deliveryDate)))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/v1/inventory/internal/completion-results")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"eventId":"close-completion-event","tenantId":"TENANT-SHWS",
                                 "eventType":"production.completion.posted.v1","aggregateType":"Completion",
                                 "aggregateId":"COMPLETION-1","occurredAt":"2026-10-12T09:00:00Z",
                                 "payload":{"completionId":"COMPLETION-1","warehouseId":"WH-CLOSE",
                                 "productId":"FG-CLOSE","qty":"2","uom":"PCS",
                                 "externalTransactionId":"WMS-CLOSE-1","allocations":[
                                 {"demandId":"DEMAND-FG-CLOSE"}]}}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.availability.qualifiedOnHandQty").value("4"))
                .andExpect(jsonPath("$.availability.fulfillableQty").value("2"));

        JsonNode rechecking = shipmentTask(taskId);
        assertThat(rechecking.path("availabilityStatus").asText()).isEqualTo("RECHECKING");
        assertThat(rechecking.path("replenishmentStatus").asText()).isEqualTo("AVAILABLE");
        assertThat(rechecking.path("postingStatus").asText()).isEqualTo("PARTIALLY_POSTED");
    }

    private String createActiveWarehouse(String code, String name) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/inventory/warehouses")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "warehouse-" + code)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"%s\",\"name\":\"%s\",\"type\":\"standard\"}".formatted(code, name)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("warehouse").path("id").asText();
    }

    @Test
    void rejectsLegacyShipmentSnapshotWithBusinessError() throws Exception {
        String tenantId = "TENANT-SHWS";
        ObjectNode order = objectMapper.createObjectNode()
                .put("id", "legacy-order").put("tenantId", tenantId).put("version", 1);
        service.repository().orders.put(FulfillmentStore.key(tenantId, "legacy-order"), order);

        ObjectNode request = objectMapper.createObjectNode()
                .put("id", "legacy-request").put("tenantId", tenantId).put("salesOrderId", "legacy-order");
        service.repository().shipmentRequests.put(FulfillmentStore.key(tenantId, "legacy-request"), request);

        ObjectNode availability = objectMapper.createObjectNode()
                .put("tenantId", tenantId).put("warehouseId", "WH-01").put("productId", "FG-001")
                .put("fulfillableQty", "10").put("allocatedReservedQty", "0")
                .put("frozenQty", "0").put("safetyStockQty", "0").put("inTransitQty", "0")
                .put("uom", "PCS").put("factVersion", 1);
        service.repository().saveAvailability(availability);

        ObjectNode task = objectMapper.createObjectNode()
                .put("id", "legacy-task").put("tenantId", tenantId)
                .put("shipmentRequestId", "legacy-request").put("salesOrderId", "legacy-order")
                .put("warehouseId", "WH-01").put("availabilityStatus", "UNCHECKED")
                .put("version", 1);
        ObjectNode line = task.putArray("lines").addObject()
                .put("id", "legacy-line").put("orderLineId", "order-line")
                .put("productId", "FG-001").put("requestedQty", "10")
                .put("reservedQty", "0").put("shortageQty", "0").put("uom", "PCS");
        service.repository().saveShipmentTask(task);

        mockMvc.perform(post("/api/v1/inventory/shipment-tasks/legacy-task/check-and-reserve")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", tenantId)
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "legacy-reserve-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"shipmentRequestId":"legacy-request","orderRevision":0,
                                 "warehouseId":"WH-01"}
                                """))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("FULFILLMENT_422_TASK_SNAPSHOT_INVALID"))
                .andExpect(jsonPath("$.error.fieldErrors[0].message").value("postedQty_required"));

        assertThat(line.path("postedQty").asText("")).isEmpty();
    }

    @Test
    void treatsMissingAvailabilityFactAsShortageForProductionRequest() throws Exception {
        String warehouseId = createActiveWarehouse("MISS", "缺事实仓库");
        String taskId = createConfirmedShipmentTask("missing-fact", warehouseId, "10", true);
        JsonNode task = shipmentTask(taskId);

        mockMvc.perform(post("/api/v1/inventory/shipment-tasks/" + taskId + "/check-and-reserve")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", String.valueOf(task.path("version").asInt()))
                        .header("X-Idempotency-Key", "reserve-missing-fact")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"shipmentRequestId":"%s","orderRevision":%s,"warehouseId":"%s"}
                                """.formatted(task.path("shipmentRequestId").asText(),
                                task.path("orderRevision").asInt(), warehouseId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outcome").value("SHORTAGE"))
                .andExpect(jsonPath("$.result").value("SHORTAGE"))
                .andExpect(jsonPath("$.task.replenishmentStatus").value("REQUIRED"))
                .andExpect(jsonPath("$.task.lines[0].reservedQty").value("0"))
                .andExpect(jsonPath("$.task.lines[0].shortageQty").value("10"))
                .andExpect(jsonPath("$.missingProductIds[0]").value("FG-CLOSE"));
    }

    private String createConfirmedShipmentTask(String marker, String warehouseId, String qty, boolean allowPartial) throws Exception {
        String body = """
                {"customerId":"CUST-CLOSE","ownerEmployeeId":"admin",
                 "fulfillmentWarehouseId":"%s","factoryResourceId":"FACT-01",
                 "requestedDeliveryDate":"%s","allowPartialShipment":%s,"currency":"CNY",
                 "recipient":{"name":"闭环收货人","phone":"13800138001","country":"中国",
                 "province":"上海","city":"上海","address":"闭环路 1 号"},
                 "lines":[{"lineNo":1,"productId":"FG-CLOSE","orderedQty":"%s","uom":"PCS",
                 "unitPrice":"10","taxRate":"0","promisedDate":"%s","allowPartialShipment":%s}]}
                """.formatted(warehouseId, deliveryDate, allowPartial, qty, deliveryDate, allowPartial);
        MvcResult created = mockMvc.perform(post("/api/v1/sales/sales-orders")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "order-" + marker)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn();
        JsonNode order = objectMapper.readTree(created.getResponse().getContentAsString());
        String orderId = order.path("id").asText();
        mockMvc.perform(post("/api/v1/sales/sales-orders/" + orderId + "/review-decisions")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "1")
                        .header("X-Idempotency-Key", "review-" + marker)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"APPROVE\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/sales/sales-orders/" + orderId + "/confirm")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "2")
                        .header("X-Idempotency-Key", "confirm-" + marker)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestedDeliveryDate\":\"" + deliveryDate + "\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/sales/sales-orders/" + orderId + "/shipment-requests")
                        .header("Authorization", "Bearer " + reviewerToken)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("If-Match", "3")
                        .header("X-Idempotency-Key", "shipment-" + marker)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"warehouseId":"%s","lines":[{"orderLineId":"%s","sourceLineRevision":2,
                                 "requestedQty":"%s","uom":"PCS"}]}
                                """.formatted(warehouseId, order.withArray("lines").get(0).path("id").asText(), qty)))
                .andExpect(status().isAccepted());
        return service.repository().shipmentTasks("TENANT-SHWS").stream()
                .filter(value -> orderId.equals(value.path("salesOrderId").asText()))
                .findFirst().orElseThrow().path("id").asText();
    }

    private JsonNode shipmentTask(String taskId) {
        return service.repository().shipmentTasks("TENANT-SHWS").stream()
                .filter(value -> taskId.equals(value.path("id").asText()))
                .findFirst().orElseThrow();
    }

    private String availability(String eventId, String warehouseId, String productId, String qty) {
        String validEventId = UUID.nameUUIDFromBytes(eventId.getBytes()).toString();
        return """
                {"eventId":"%s","warehouseId":"%s","productId":"%s",
                 "qualifiedOnHandQty":"%s","allocatedReservedQty":"0","frozenQty":"0",
                 "safetyStockQty":"0","inTransitQty":"0","fulfillableQty":"%s","uom":"PCS",
                 "formulaVersion":"FULFILLABLE-V1","factVersion":1,"sourceSystem":"TEST",
                 "asOf":"2026-10-12T00:00:00Z"}
                """.formatted(validEventId, warehouseId, productId, qty, qty);
    }
}
