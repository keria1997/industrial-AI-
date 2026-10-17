import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const retiredRoutes = new Set([
  "POST /api/v1/fulfillment/rmas",
  "PATCH /api/v1/fulfillment/rmas/{id}/approve",
  "PATCH /api/v1/fulfillment/rmas/{id}/inspect",
  "PATCH /api/v1/fulfillment/rmas/{id}/close",
  "POST /api/v1/fulfillment/customer-receipts",
  "GET /api/v1/platform/outreach-settings",
  "PUT /api/v1/platform/outreach-settings",
]);

export function scanSpringRoutes(backendDir = "backend") {
  const sourceDir = join(backendDir, "src/main/java");
  const routes = [];
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith(".java")) routes.push(...scanJavaFile(path));
    }
  };
  visit(sourceDir);
  routes.sort((left, right) =>
    left.path.localeCompare(right.path) || left.method.localeCompare(right.method),
  );
  return routes;
}

function scanJavaFile(path) {
  const source = readFileSync(path, "utf8");
  if (!/@(?:Rest)?Controller\b/.test(source)) return [];
  const base = source.match(/@RequestMapping\("([^"]+)"\)/)?.[1] ?? "";
  const controller = path.split("/").at(-1).replace(/\.java$/, "");
  const routes = [];
  const pattern = /@(Get|Post|Put|Patch|Delete)Mapping(?:\((?:value\s*=\s*)?"([^"]+)"[^)]*\))?/g;
  for (const match of source.matchAll(pattern)) {
    const method = match[1].toUpperCase();
    const suffix = match[2] ?? "";
    const path = suffix.startsWith("/") ? `${base}${suffix}`
      : suffix ? `${base}/${suffix}` : base;
    const classification = path.includes("/internal/") ? "internal"
      : retiredRoutes.has(`${method} ${path}`) ? "retired" : "public";
    routes.push({ method, path, controller, classification });
  }
  return routes;
}

export function readRouteInventory(path = "docs/openapi/backend/v1/route-inventory.json") {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readGeneratedOpenApi(path = "docs/openapi/backend/v1/generated/all-modules.openapi.json") {
  return JSON.parse(readFileSync(path, "utf8"));
}
