import { buildProductionApp } from "./app.js";
import { InMemoryProductionRepository } from "./memory-store.js";
import { PgProductionRepository } from "./pg-store.js";

const host = process.env.PRODUCTION_API_HOST ?? "127.0.0.1";
const port = Number(process.env.PRODUCTION_API_PORT ?? 5185);

const repository = process.env.DATABASE_URL
  ? PgProductionRepository.fromConnectionString(process.env.DATABASE_URL)
  : new InMemoryProductionRepository();
const app = buildProductionApp(repository);

app.listen({ host, port }).then(() => {
  console.log(`Production API listening on http://${host}:${port}/api/v1/production`);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
