import { describe, expect, it } from "vitest";
import { InMemoryFulfillmentStore } from "../src/modules/fulfillment/memory-store.js";
import { FulfillmentOutboxWorker, ReferenceEventPublisher } from "../src/workers/fulfillment-outbox-worker.js";

describe("fulfillment Outbox worker", () => {
  it("publishes pending events once and moves repeated failures to dead letter", async () => {
    const store = new InMemoryFulfillmentStore();
    const event = { eventId: "838018c9-44dc-49f6-b40d-ac82c22a2785", tenantId: "TENANT-SHWS", eventType: "inventory.test.v1", aggregateType: "Test", aggregateId: "1", aggregateVersion: 1, correlationId: "c15a385b-2b7d-40ec-9493-75ee80ccb1e5", traceId: "trace", payload: {}, status: "PENDING" as const, attempts: 0, createdAt: new Date().toISOString() };
    await store.addOutbox(event);
    const publisher = new ReferenceEventPublisher();
    expect(await new FulfillmentOutboxWorker(store, publisher).runOnce("TENANT-SHWS")).toEqual({ published: 1, failed: 0 });
    expect(publisher.published).toHaveLength(1);
    expect((await store.listPendingOutbox("TENANT-SHWS"))).toHaveLength(0);

    await store.addOutbox({ ...event, eventId: "b8500d65-f076-4aeb-a772-195762d5b6a5" });
    const failing = new FulfillmentOutboxWorker(store, { publish: async () => { throw new Error("broker unavailable"); } }, 2);
    await failing.runOnce("TENANT-SHWS"); await failing.runOnce("TENANT-SHWS");
    expect(store.snapshot().outbox.get("TENANT-SHWS:b8500d65-f076-4aeb-a772-195762d5b6a5")?.status).toBe("DEAD_LETTER");
  });
});
