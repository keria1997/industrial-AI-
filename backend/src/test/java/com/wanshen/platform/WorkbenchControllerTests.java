package com.wanshen.platform;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.ai.AiStore;
import com.wanshen.platform.finance.FinanceStore;
import com.wanshen.platform.finance.AbstractFinanceStore.Receivable;
import com.wanshen.platform.fulfillment.FulfillmentStore;
import com.wanshen.platform.message.MessageStore;
import com.wanshen.platform.message.AbstractMessageStore;
import com.wanshen.platform.personnel.PersonnelStore;
import com.wanshen.platform.personnel.AbstractPersonnelStore.Attendance;
import com.wanshen.platform.personnel.AbstractPersonnelStore.Employee;
import com.wanshen.platform.production.ProductionStore;
import com.wanshen.platform.supplychain.SupplyChainStore;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WorkbenchControllerTests {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void buildsBossMetricsFromBusinessFacts() {
        String today = LocalDate.now().toString();
        HttpServletRequest request = mock(HttpServletRequest.class);
        RequestContextService contexts = mock(RequestContextService.class);
        when(contexts.from(request)).thenReturn(new RequestContext(
                "TENANT-SHWS", "admin", List.of("*"), "trace", null, null
        ));

        FinanceStore financeStore = new FinanceStore();
        financeStore.saveReceivable(receivable("AR-1", today, "12000", "pending"));
        financeStore.saveReceivable(receivable("AR-2", "2000-01-01", "500", "pending"));

        PersonnelStore personnelStore = new PersonnelStore();
        personnelStore.saveEmployee(employee("EMP-1"));
        personnelStore.saveEmployee(employee("EMP-2"));
        personnelStore.saveAttendance(attendance("ATT-1", "EMP-1", today));

        FulfillmentStore fulfillmentStore = new FulfillmentStore();
        fulfillmentStore.saveAvailability(node("""
                {"tenantId":"TENANT-SHWS","warehouseId":"WH","productId":"MAT-1",
                 "safetyStockQty":"10","fulfillableQty":"5"}
                """));

        ProductionStore productionStore = mock(ProductionStore.class);
        when(productionStore.demands(any(), any(), any(), any(), anyInt(), anyInt())).thenReturn(List.of());
        when(productionStore.workOrders(any(), any(), any(), any(), anyInt(), anyInt())).thenReturn(List.of());
        when(productionStore.inspections(any(), any())).thenReturn(List.of());
        MessageStore messageStore = mock(MessageStore.class);
        when(messageStore.records(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(new AbstractMessageStore.Page<>(List.of(), 0));

        WorkbenchController controller = new WorkbenchController(
                financeStore, personnelStore, productionStore, fulfillmentStore,
                new SupplyChainStore(), new AiStore(), messageStore, contexts, mapper
        );

        Map<String, Object> response = controller.dashboard(request, "老板", null, null, null, "ALL", 5, 10, null);
        assertEquals("1.1", response.get("schemaVersion"));
        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) response.get("data");
        assertEquals("老板", data.get("role"));
        assertEquals(List.of("TENANT_OWNER", "ADMIN"), data.get("roleGroups"));

        Map<String, Object> metrics = (Map<String, Object>) data.get("metrics");
        assertEquals("AVAILABLE", ((Map<?, ?>) metrics.get("orderAmount")).get("availability"));
        assertEquals("UNAVAILABLE", ((Map<?, ?>) metrics.get("confirmedRevenueAmount")).get("availability"));
        assertEquals("UNAVAILABLE", ((Map<?, ?>) metrics.get("shippedRecognizedAmount")).get("availability"));
        @SuppressWarnings("unchecked")
        List<WorkbenchController.Metric> legacyMetrics = (List<WorkbenchController.Metric>) metrics.get("legacy");
        assertEquals("0.00", metric(legacyMetrics, "productionCompletionRate").value());
        assertEquals("1", metric(legacyMetrics, "lowStockItems").value());
        org.junit.jupiter.api.Assertions.assertTrue(
                legacyMetrics.stream().noneMatch(item -> "attendanceRate".equals(item.key())));

        Map<String, Object> adminResponse = controller.dashboard(request, "管理员", null, null, null, "ALL", 5, 10, null);
        Map<String, Object> adminData = (Map<String, Object>) adminResponse.get("data");
        assertEquals("管理员", adminData.get("role"));
        assertEquals(data.get("metrics"), adminData.get("metrics"));

        Map<String, Object> unmatchedSearch = controller.dashboard(request, "老板", "NO-MATCH", null, null, "ALL", 5, 10, null);
        Map<String, Object> unmatchedData = (Map<String, Object>) unmatchedSearch.get("data");
        assertEquals(0, ((Map<?, ?>) unmatchedData.get("todos")).get("total"));
        Map<String, Object> matchedSearch = controller.dashboard(request, "老板", "AR-2", null, null, "ALL", 5, 10, null);
        Map<String, Object> matchedData = (Map<String, Object>) matchedSearch.get("data");
        assertEquals(1, ((Map<?, ?>) matchedData.get("todos")).get("total"));
    }

    @Test
    void rejectsUnknownRole() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        RequestContextService contexts = mock(RequestContextService.class);
        when(contexts.from(request)).thenReturn(new RequestContext(
                "TENANT-SHWS", "admin", List.of("*"), "trace", null, null
        ));
        WorkbenchController controller = new WorkbenchController(
                new FinanceStore(), new PersonnelStore(), mock(ProductionStore.class), new FulfillmentStore(),
                new SupplyChainStore(), new AiStore(), new MessageStore(), contexts, mapper
        );

        assertThrows(com.wanshen.platform.web.ApiException.class, () -> controller.dashboard(request, "访客", null, null, null, "ALL", 5, 10, null));
    }

    @Test
    void exposesSourceStatusWithoutUndefinedValues() {
        String now = Instant.now().toString();
        HttpServletRequest request = mock(HttpServletRequest.class);
        RequestContextService contexts = mock(RequestContextService.class);
        when(contexts.from(request)).thenReturn(new RequestContext(
                "TENANT-SHWS", "admin", List.of("*"), "trace", null, null
        ));
        ProductionStore productionStore = mock(ProductionStore.class);
        when(productionStore.demands(any(), any(), any(), any(), anyInt(), anyInt())).thenReturn(List.of());
        when(productionStore.workOrders(any(), any(), any(), any(), anyInt(), anyInt())).thenReturn(List.of());
        when(productionStore.inspections(any(), any())).thenReturn(List.of());
        MessageStore messageStore = mock(MessageStore.class);
        when(messageStore.records(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(new AbstractMessageStore.Page<>(List.of(), 0));

        FulfillmentStore fulfillmentStore = new FulfillmentStore();
        fulfillmentStore.saveOrder(node("""
                {"tenantId":"TENANT-SHWS","id":"SO-1","orderNo":"SO-001","createdAt":"%s",
                 "updatedAt":"%s","version":3,"overallStatus":"CONFIRMED"}
                """.formatted(now, now)));
        fulfillmentStore.saveShipmentTask(node("""
                {"tenantId":"TENANT-SHWS","id":"TASK-1","workflowStatus":"COMPLETED",
                 "createdAt":"%s","updatedAt":"%s","version":2,
                 "lines":[{"id":"LINE-1","postedQty":"2"}]}
                """.formatted(now, now)));
        WorkbenchController controller = new WorkbenchController(
                new FinanceStore(), new PersonnelStore(), productionStore, fulfillmentStore,
                new SupplyChainStore(), new AiStore(), messageStore, contexts, mapper
        );

        Map<String, Object> response = controller.dashboard(
                request, "老板", null, null, null, "ALL", 5, 10, null);
        Map<String, Object> data = (Map<String, Object>) response.get("data");
        List<Map<String, Object>> sources = (List<Map<String, Object>>) data.get("sources");
        Map<String, Map<String, Object>> bySource = new java.util.HashMap<>();
        for (Map<String, Object> item : sources) {
            bySource.put(String.valueOf(item.get("source")), item);
        }
        assertEquals("AVAILABLE", bySource.get("SalesOrder").get("status"));
        assertEquals("SOURCE_PENDING", bySource.get("RevenueRecognition").get("status"));
        assertEquals("SOURCE_MISSING", bySource.get("RevenueRecognition").get("errorCode"));
        assertEquals("AVAILABLE", bySource.get("ShipmentRecognition").get("status"));
        assertEquals("AVAILABLE", bySource.get("Message").get("status"));
        org.junit.jupiter.api.Assertions.assertTrue(sources.stream()
                .allMatch(item -> item.containsKey("status") && item.containsKey("errorCode")
                        && item.get("status") != null));
    }

    private WorkbenchController.Metric metric(List<WorkbenchController.Metric> values, String key) {
        return values.stream().filter(item -> item.key().equals(key)).findFirst().orElseThrow();
    }

    private Receivable receivable(String id, String createdAt, String amount, String status) {
        return new Receivable(id, "TENANT-SHWS", id, "客户", "C-1", "客户一", "AR", "order",
                "SO-1", "SO-1", "CNY", amount, "0", amount, status, createdAt, null, null,
                "", 1, createdAt + "T00:00:00Z", createdAt + "T00:00:00Z", "admin");
    }

    private Employee employee(String id) {
        return new Employee(id, "TENANT-SHWS", id, "员工", "部门", "岗位", "", "",
                "active", "2020-01-01", null, Map.of(), "", 1,
                Instant.now().toString(), Instant.now().toString(), "admin");
    }

    private Attendance attendance(String id, String employeeId, String today) {
        return new Attendance(id, "TENANT-SHWS", id, employeeId, "员工", today, "day",
                "08:00", "18:00", "normal", "", 1, Instant.now().toString(),
                Instant.now().toString(), "admin");
    }

    private JsonNode node(String value) {
        try {
            return mapper.readTree(value);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
