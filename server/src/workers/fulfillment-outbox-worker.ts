import type { FulfillmentStore } from "../modules/fulfillment/store.js";
import type { ReliableEvent } from "../modules/fulfillment/types.js";

export interface FulfillmentEventPublisher {
  publish(event: ReliableEvent): Promise<void>;
}

export class ReferenceEventPublisher implements FulfillmentEventPublisher {
  readonly published: ReliableEvent[] = [];
  async publish(event: ReliableEvent) { this.published.push(structuredClone(event)); }
}

export class FulfillmentOutboxWorker {
  constructor(
    private readonly store: FulfillmentStore,
    private readonly publisher: FulfillmentEventPublisher,
    private readonly maxAttempts = 8,
  ) {}

  async runOnce(tenantId: string) {
    let published = 0; let failed = 0;
    for (const event of await this.store.listPendingOutbox(tenantId)) {
      try {
        await this.publisher.publish(event);
        await this.store.markOutboxPublished(tenantId, event.eventId);
        published += 1;
      } catch (error) {
        await this.store.markOutboxFailed(tenantId, event.eventId, error instanceof Error ? error.message : "Unknown publisher error", this.maxAttempts);
        failed += 1;
      }
    }
    return { published, failed };
  }
}
