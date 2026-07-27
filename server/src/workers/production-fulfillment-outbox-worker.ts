import type { FulfillmentService } from "../modules/fulfillment/service.js";
import type { ProductionRepository } from "../store.js";
import type { RequestContext } from "../types.js";

type CompletionPostedPayload = {
  completionId: string; workOrderId: string; externalTransactionId: string; warehouseId: string;
  productId: string; qty: string; uom: string; productionDate: string;
  allocations: Array<{ demandId: string; qty: string }>;
};

export class ProductionFulfillmentOutboxWorker {
  constructor(
    private readonly repository: ProductionRepository,
    private readonly fulfillment: FulfillmentService,
    private readonly maxAttempts = 8,
  ) {}

  async runOnce(tenantId: string) {
    let published = 0;
    let failed = 0;
    const events = await this.repository.listPendingOutboxEvents(tenantId, "production.completion.posted.v1");
    for (const event of events) {
      try {
        const payload = event.payload as CompletionPostedPayload;
        const context: RequestContext = {
          tenantId, actorId: "production-outbox-worker", permissions: new Set(["inventory.availability.sync"]),
          permissionVersion: "system-worker-v1", traceId: event.traceId,
        };
        await this.fulfillment.receiveCompletion(context, {
          eventId: event.eventId, completionId: payload.completionId, externalTransactionId: payload.externalTransactionId,
          warehouseId: payload.warehouseId, productId: payload.productId, qty: payload.qty, uom: payload.uom,
          occurredAt: event.createdAt, correlationId: event.correlationId, allocations: payload.allocations,
        });
        await this.repository.markOutboxEventPublished(tenantId, event.eventId);
        published += 1;
      } catch (error) {
        await this.repository.markOutboxEventFailed(tenantId, event.eventId, error instanceof Error ? error.message : "Unknown completion relay error", this.maxAttempts);
        failed += 1;
      }
    }
    return { published, failed };
  }
}
