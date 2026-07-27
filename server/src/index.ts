import { buildProductionApp } from "./app.js";
import { InMemoryProductionRepository } from "./memory-store.js";
import { PgProductionRepository } from "./pg-store.js";
import { InMemoryFulfillmentStore } from "./modules/fulfillment/memory-store.js";
import { PgFulfillmentStore } from "./modules/fulfillment/pg-store.js";

const host = process.env.PRODUCTION_API_HOST ?? "127.0.0.1";
const port = Number(process.env.PRODUCTION_API_PORT ?? 5185);
const authSecret = process.env.AUTH_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "local-development-auth-secret-change-me");
if (!authSecret) throw new Error("AUTH_SECRET is required when NODE_ENV=production");

const repository = process.env.DATABASE_URL
  ? PgProductionRepository.fromConnectionString(process.env.DATABASE_URL)
  : new InMemoryProductionRepository();
const fulfillmentStore = process.env.DATABASE_URL
  ? PgFulfillmentStore.fromConnectionString(process.env.DATABASE_URL)
  : new InMemoryFulfillmentStore();
if (repository instanceof InMemoryProductionRepository) {
  const timestamp = new Date().toISOString();
  repository.seedInventoryAvailability(["TENANT-SHWS", "TENANT-HDJG"].map((tenantId) => ({
    tenantId, productId: "FG001", inventoryWarehouseId: "WH-FG-01", availableQty: "8", uom: "PCS",
    factVersion: 1, sourceEventId: `DEMO-SEED-${tenantId}-FG001`, sourceSystem: "DEMO_INVENTORY_SEED",
    asOf: timestamp, updatedAt: timestamp,
  })));
}
if (fulfillmentStore instanceof InMemoryFulfillmentStore) {
  const timestamp = new Date().toISOString();
  for (const tenantId of ["TENANT-SHWS", "TENANT-HDJG"]) {
    await fulfillmentStore.upsertAvailability({
      tenantId, warehouseId: "WH-FG-01", productId: "FG001",
      qualifiedOnHandQty: "120", allocatedReservedQty: "0", frozenQty: "0", safetyStockQty: "0",
      inTransitQty: "0", fulfillableQty: "120", uom: "PCS", formulaVersion: "FULFILLABLE-V1",
      factVersion: 1, sourceSystem: "REFERENCE_WMS", sourceEventId: crypto.randomUUID(), asOf: timestamp,
    });
  }
}
const app = buildProductionApp(repository, {
  authSecret,
  allowInsecureHeaders: false,
  demoAuthEnabled: process.env.DEMO_AUTH_ENABLED !== "false" && process.env.NODE_ENV !== "production",
  demoAccount: process.env.DEMO_AUTH_ACCOUNT ?? "admin,reviewer,operator,inspector",
  demoPassword: process.env.DEMO_AUTH_PASSWORD ?? "123456",
  fulfillmentStore,
  workerTenantIds: ["TENANT-SHWS", "TENANT-HDJG"],
  fulfillmentReviewRequired: false,
});

app.addHook("onClose", async () => {
  if (fulfillmentStore instanceof PgFulfillmentStore) await fulfillmentStore.close();
  if (repository instanceof PgProductionRepository) await repository.close();
});

app.listen({ host, port }).then(() => {
  console.log(`Production API listening on http://${host}:${port}/api/v1/production`);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
