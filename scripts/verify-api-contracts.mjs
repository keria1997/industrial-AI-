import { readFileSync } from "node:fs";
import { scanSpringRoutes, readRouteInventory, readGeneratedOpenApi } from "./api-contract-lib.mjs";

const sourceRoutes = scanSpringRoutes();
const inventory = readRouteInventory();
const openApi = readGeneratedOpenApi();
const sourceKeys = new Set(sourceRoutes.map(route => `${route.method} ${route.path}`));
const inventoryKeys = new Set((inventory.routes ?? []).map(route => `${route.method} ${route.path}`));
const openApiKeys = new Set(Object.entries(openApi.paths ?? {}).flatMap(([path, methods]) =>
  Object.keys(methods)
    .filter(method => method !== "parameters")
    .map(method => `${method.toUpperCase()} ${path}`),
));

const problems = [];
for (const route of sourceRoutes) {
  const key = `${route.method} ${route.path}`;
  if (!inventoryKeys.has(key)) problems.push(`Route missing from route inventory: ${key}`);
  if (!openApiKeys.has(key)) problems.push(`Route missing from generated OpenAPI: ${key}`);
}
for (const key of inventoryKeys) if (!sourceKeys.has(key)) problems.push(`Stale route inventory entry: ${key}`);
for (const key of openApiKeys) if (!sourceKeys.has(key)) problems.push(`Stale generated OpenAPI operation: ${key}`);
for (const route of inventory.routes ?? []) {
  const key = `${route.method} ${route.path}`;
  const source = sourceRoutes.find(item => `${item.method} ${item.path}` === key);
  if (source && source.classification !== route.classification) {
    problems.push(`Classification drift for ${key}: inventory=${route.classification}, source=${source.classification}`);
  }
}

if (problems.length) {
  console.error(`API contract drift detected (${problems.length}):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`API contract parity verified: ${sourceRoutes.length} routes, ${openApiKeys.size} OpenAPI operations.`);
