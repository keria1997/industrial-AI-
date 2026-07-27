import { randomUUID } from "node:crypto";
import { addDecimal, compareDecimal, minDecimal, subtractDecimal } from "../../decimal.js";
import type { FulfillmentStore } from "./store.js";
import type { AdapterOutcome, AvailabilityFact } from "./types.js";

export type ReserveLineInput = { lineId: string; productId: string; requestedQty: string; uom: string };
export type ReserveLineResult = ReserveLineInput & { reservedQty: string; shortageQty: string };

export type ReserveResult = {
  outcome: AdapterOutcome;
  adapterKind: "REFERENCE" | "CUSTOMER";
  externalReservationId?: string;
  factVersion?: number;
  formulaVersion?: string;
  lines: ReserveLineResult[];
  failureCode?: string;
};

export type PostLineInput = { lineId: string; productId: string; qty: string; uom: string };
export type PostResult = {
  outcome: AdapterOutcome; adapterKind: "REFERENCE" | "CUSTOMER";
  externalTransactionIds: string[]; lines: Array<PostLineInput & { postedQty: string }>;
  failureCode?: string;
};

export interface InventoryGateway {
  availability(store: FulfillmentStore, tenantId: string, warehouseId: string, productIds: string[]): Promise<AvailabilityFact[]>;
  checkAndReserve(store: FulfillmentStore, input: { tenantId: string; warehouseId: string; idempotencyKey: string; allowPartial: boolean; lines: ReserveLineInput[] }): Promise<ReserveResult>;
  queryReservation(idempotencyKey: string): Promise<ReserveResult | undefined>;
  release(store: FulfillmentStore, input: { tenantId: string; warehouseId: string; idempotencyKey: string; lines: PostLineInput[] }): Promise<PostResult>;
  queryRelease(idempotencyKey: string): Promise<PostResult | undefined>;
  postOutbound(store: FulfillmentStore, input: { tenantId: string; warehouseId: string; idempotencyKey: string; lines: PostLineInput[] }): Promise<PostResult>;
  queryOutbound(idempotencyKey: string): Promise<PostResult | undefined>;
}

export class ReferenceWmsAdapter implements InventoryGateway {
  private readonly results = new Map<string, ReserveResult | PostResult>();
  private readonly forced = new Map<string, AdapterOutcome>();

  forceNext(idempotencyKey: string, outcome: AdapterOutcome) { this.forced.set(idempotencyKey, outcome); }

  async availability(store: FulfillmentStore, tenantId: string, warehouseId: string, productIds: string[]) {
    const facts = await Promise.all(productIds.map((productId) => store.getAvailability(tenantId, warehouseId, productId)));
    return facts.filter((item): item is AvailabilityFact => Boolean(item));
  }

  async checkAndReserve(store: FulfillmentStore, input: { tenantId: string; warehouseId: string; idempotencyKey: string; allowPartial: boolean; lines: ReserveLineInput[] }) {
    const existing = this.results.get(input.idempotencyKey) as ReserveResult | undefined;
    if (existing) return structuredClone(existing);
    const forced = this.forced.get(input.idempotencyKey);
    if (forced === "PROCESSING_UNKNOWN" || forced === "REJECTED") {
      const result: ReserveResult = { outcome: forced, adapterKind: "REFERENCE", lines: input.lines.map((line) => ({ ...line, reservedQty: "0", shortageQty: line.requestedQty })), failureCode: forced === "REJECTED" ? "REFERENCE_REJECTED" : undefined };
      this.results.set(input.idempotencyKey, result); return structuredClone(result);
    }
    const productIds = [...new Set(input.lines.map((line) => line.productId))];
    const factList = await Promise.all(productIds.map((productId) => store.getAvailability(input.tenantId, input.warehouseId, productId)));
    const factByProduct = new Map(productIds.map((productId, index) => [productId, factList[index]]));
    const facts = input.lines.map((line) => factByProduct.get(line.productId));
    if (facts.some((fact) => !fact)) {
      const result: ReserveResult = { outcome: "REJECTED", adapterKind: "REFERENCE", lines: input.lines.map((line) => ({ ...line, reservedQty: "0", shortageQty: line.requestedQty })), failureCode: "AVAILABILITY_FACT_MISSING" };
      this.results.set(input.idempotencyKey, result); return structuredClone(result);
    }
    const requiredByProduct = new Map<string, string>();
    for (const line of input.lines) requiredByProduct.set(line.productId, addDecimal(requiredByProduct.get(line.productId) ?? "0", line.requestedQty));
    const allEnough = [...requiredByProduct].every(([productId, required]) => compareDecimal(factByProduct.get(productId)!.fulfillableQty, required) >= 0);
    const reserveNothing = !input.allowPartial && !allEnough;
    const availableByProduct = new Map(productIds.map((productId) => [productId, factByProduct.get(productId)!.fulfillableQty]));
    const lines = input.lines.map((line) => {
      const reservedQty = reserveNothing ? "0" : minDecimal(line.requestedQty, availableByProduct.get(line.productId)!);
      availableByProduct.set(line.productId, subtractDecimal(availableByProduct.get(line.productId)!, reservedQty));
      return { ...line, reservedQty, shortageQty: subtractDecimal(line.requestedQty, reservedQty) };
    });
    for (const productId of productIds) {
      const fact = factByProduct.get(productId)!;
      const reserved = lines.filter((line) => line.productId === productId).reduce((total, line) => addDecimal(total, line.reservedQty), "0");
      if (compareDecimal(reserved, "0") > 0) {
        await store.upsertAvailability({
          ...fact,
          allocatedReservedQty: addDecimal(fact.allocatedReservedQty, reserved),
          fulfillableQty: subtractDecimal(fact.fulfillableQty, reserved),
          factVersion: fact.factVersion + 1,
          sourceEventId: randomUUID(), sourceSystem: "REFERENCE_WMS", asOf: new Date().toISOString(),
        });
      }
    }
    const totalReserved = lines.reduce((total, line) => addDecimal(total, line.reservedQty), "0");
    const hasShortage = lines.some((line) => compareDecimal(line.shortageQty, "0") > 0);
    const outcome: AdapterOutcome = compareDecimal(totalReserved, "0") === 0 ? "SHORTAGE" : hasShortage ? "PARTIALLY_SUCCEEDED" : "SUCCEEDED";
    const result: ReserveResult = {
      outcome, adapterKind: "REFERENCE", externalReservationId: `REF-RES-${randomUUID()}`,
      factVersion: Math.max(...factList.map((fact) => fact!.factVersion + 1)), formulaVersion: factList[0]!.formulaVersion, lines,
    };
    this.results.set(input.idempotencyKey, result); return structuredClone(result);
  }

  async queryReservation(idempotencyKey: string) { return structuredClone(this.results.get(idempotencyKey) as ReserveResult | undefined); }

  private async deterministicPost(kind: string, input: { idempotencyKey: string; lines: PostLineInput[] }) {
    const existing = this.results.get(input.idempotencyKey) as PostResult | undefined;
    if (existing) return structuredClone(existing);
    const outcome = this.forced.get(input.idempotencyKey) ?? "SUCCEEDED";
    const result: PostResult = {
      outcome, adapterKind: "REFERENCE", failureCode: outcome === "REJECTED" ? "REFERENCE_REJECTED" : undefined,
      externalTransactionIds: outcome === "SUCCEEDED" || outcome === "PARTIALLY_SUCCEEDED" ? input.lines.map(() => `REF-${kind}-${randomUUID()}`) : [],
      lines: input.lines.map((line) => ({ ...line, postedQty: outcome === "SUCCEEDED" ? line.qty : "0" })),
    };
    this.results.set(input.idempotencyKey, result); return structuredClone(result);
  }

  async release(_store: FulfillmentStore, input: { tenantId: string; warehouseId: string; idempotencyKey: string; lines: PostLineInput[] }) { return this.deterministicPost("REL", input); }
  async queryRelease(idempotencyKey: string) { return structuredClone(this.results.get(idempotencyKey) as PostResult | undefined); }
  async postOutbound(_store: FulfillmentStore, input: { tenantId: string; warehouseId: string; idempotencyKey: string; lines: PostLineInput[] }) { return this.deterministicPost("OUT", input); }
  async queryOutbound(idempotencyKey: string) { return structuredClone(this.results.get(idempotencyKey) as PostResult | undefined); }
}
