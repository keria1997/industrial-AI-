package com.wanshen.platform.production;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import org.junit.jupiter.api.Test;
import java.util.List;
import static com.wanshen.platform.production.ProductionExecutionTests.*;
import static org.assertj.core.api.Assertions.*;

class ProductionBomSnapshotTests {
    static ObjectNode bom() {
        return json("""
            {"productId":"FG1","routingSnapshotId":"R1",
             "routingSnapshot":{"id":"R1","productId":"FG1","operations":[
               {"sequence":10,"code":"ASSEMBLY","name":"Assembly","workCenterResourceId":"WC1","standardMinutes":"1.5"}]},
             "lines":[{"materialId":"RM1","warehouseId":"WH1","qtyPer":"2","uom":"PCS"}]}
            """);
    }
    @Test void missingOrMismatchedRoutingAndInvalidOperationsAreRejected() {
        var service = new ProductionService(new ProductionStore(), MAPPER);
        for (String field : List.of("id", "productId", "operations")) {
            ObjectNode input = bom();
            ((ObjectNode) input.path("routingSnapshot")).remove(field);
            assertThatThrownBy(() -> service.saveBom(context("T", "admin", field, null), input)).isInstanceOf(ApiException.class);
        }
        for (String minutes : List.of("0", "-1", "1.0000001")) {
            ObjectNode input = bom();
            ((ObjectNode) input.path("routingSnapshot").path("operations").get(0)).put("standardMinutes", minutes);
            assertThatThrownBy(() -> service.saveBom(context("T", "admin", minutes, null), input)).isInstanceOf(ApiException.class);
        }
        ObjectNode input = bom();
        input.withObject("/routingSnapshot").withArray("operations").add(input.path("routingSnapshot").path("operations").get(0).deepCopy());
        assertThatThrownBy(() -> service.saveBom(context("T", "admin", "duplicate", null), input)).isInstanceOf(ApiException.class);
    }
    @Test void publishRepairsBlockedDemandAndPreservesTenantVersionAndReplay() {
        var store = new ProductionStore();
        var service = new ProductionService(store, MAPPER);
        JsonNode demand = service.createDemand(context("T", "writer", "create", null), json("""
            {"sourceType":"MANUAL","productId":"FG1","qty":"1","uom":"PCS","dueDate":"2026-11-30","factoryResourceId":"F1"}
            """)).body();
        String id = demand.path("id").asText();
        assertThat(service.validateDemand(context("T", "writer", "blocked", 1), id, json("{}")).body().path("status").asText()).isEqualTo("BLOCKED");
        JsonNode published = service.saveBom(context("T", "admin", "publish", null), bom()).body();
        assertThat(service.saveBom(context("T", "admin", "publish", null), bom()).replayed()).isTrue();
        assertThat(published.path("publishedBy").asText()).isEqualTo("admin");
        assertThat(service.listBoms(context("OTHER", "admin", "list", null))).isEmpty();
        assertThatThrownBy(() -> service.listBoms(new RequestContext("T", "x", List.of(), "x", null, null))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.saveBom(context("T", "admin", "conflict", 99), bom())).isInstanceOf(ApiException.class);
        assertThat(service.validateDemand(context("T", "writer", "pass", 2), id, json("{}")).body().path("status").asText()).isEqualTo("PENDING_REVIEW");
        ObjectNode archived = (ObjectNode) store.demand("T", id).orElseThrow();
        archived.put("archived", true); store.saveDemand(archived);
        assertThat(store.demands("T", null, null, null, 100, 0)).isEmpty();
    }
}
