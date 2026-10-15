package com.wanshen.platform.production;

import com.fasterxml.jackson.databind.JsonNode;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import java.util.List;

public interface ProductionInventoryPort {
    List<JsonNode> check(String tenantId, List<JsonNode> requirements);
    JsonNode reserve(RequestContext context, String workOrderId, List<JsonNode> requirements);
    JsonNode consume(RequestContext context, String workOrderId);
}
