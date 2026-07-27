import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryProductionRepository } from "../src/memory-store.js";
import { ReferenceWmsAdapter } from "../src/modules/fulfillment/inventory-gateway.js";
import { InMemoryFulfillmentStore } from "../src/modules/fulfillment/memory-store.js";
import { FulfillmentService } from "../src/modules/fulfillment/service.js";
import { EnvironmentKeyProvider } from "../src/shared/key-provider.js";
import { ProductionFulfillmentOutboxWorker } from "../src/workers/production-fulfillment-outbox-worker.js";

describe("production completion fulfillment relay", () => {
  it("moves a posted completion from production Outbox to inventory Inbox exactly once", async () => {
    const tenantId = "TENANT-SHWS";
    const eventId = randomUUID();
    const completionId = randomUUID();
    const production = new InMemoryProductionRepository();
    const fulfillmentStore = new InMemoryFulfillmentStore();
    const fulfillment = new FulfillmentService(
      fulfillmentStore,
      new ReferenceWmsAdapter(),
      new EnvironmentKeyProvider("test-key", Buffer.alloc(32, 9).toString("base64")),
      { createProductionDemand: async () => ({ id: randomUUID(), code: "DM-TEST" }) },
    );
    await production.addOutboxEvent({
      id: randomUUID(), tenantId, eventId, eventType: "production.completion.posted.v1", eventVersion: 1,
      aggregateType: "Completion", aggregateId: completionId, aggregateVersion: 2,
      correlationId: randomUUID(), traceId: "trace-completion", status: "PENDING", retryCount: 0,
      createdAt: new Date().toISOString(), payload: {
        completionId, workOrderId: randomUUID(), externalTransactionId: "INV-IN-001", warehouseId: "WH-FG-01",
        productId: "FG001", qty: "2", uom: "PCS", productionDate: "2026-07-26",
        allocations: [{ demandId: randomUUID(), qty: "2" }],
      },
    });

    const worker = new ProductionFulfillmentOutboxWorker(production, fulfillment);
    expect(await worker.runOnce(tenantId)).toEqual({ published: 1, failed: 0 });
    expect(await worker.runOnce(tenantId)).toEqual({ published: 0, failed: 0 });
    expect(fulfillmentStore.snapshot().transactions.size).toBe(1);
    expect(fulfillmentStore.snapshot().inbox.get(`${tenantId}:production-completion:${eventId}`)?.eventType).toBe("production.completion.posted.v1");
    expect(production.snapshot().outbox.find((event) => event.eventId === eventId)?.status).toBe("PUBLISHED");
  });
});
