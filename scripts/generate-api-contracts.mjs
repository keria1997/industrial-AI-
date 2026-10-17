import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { scanSpringRoutes } from "./api-contract-lib.mjs";

const routes = scanSpringRoutes();
const paths = {};
for (const route of routes) {
  paths[route.path] ??= {};
  const operationId = route.method + route.path
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  paths[route.path][route.method.toLowerCase()] = {
    operationId,
    tags: [route.controller.replace(/Controller$/, "")],
    summary: `${route.method} ${route.path}`,
    description: `Implemented by ${route.controller}.`,
    "x-classification": route.classification,
    responses: {
      200: { description: "Successful response follows the module DTO contract." },
      400: { description: "Invalid request." },
      401: { description: "Missing, expired or revoked session." },
      403: { description: "Permission, tenant or resource scope denied." },
      500: { description: "Unexpected server error." },
    },
  };
  if (["POST", "PATCH", "PUT", "DELETE"].includes(route.method)) {
    paths[route.path][route.method.toLowerCase()].responses[409] = {
      description: "Version, state, idempotency or business conflict.",
    };
  }
}

const document = {
  openapi: "3.0.3",
  info: {
    title: "Industrial AI ERP Backend API",
    version: "1.0.0",
    description: [
      "Generated route-level contract for every Spring MVC endpoint.",
      "Curated YAML files may add request/response field detail and must not conflict with this file.",
      "x-classification values: public, internal, retired.",
    ].join("\n"),
  },
  servers: [{ url: "/" }],
  security: [{ bearerAuth: [] }],
  tags: [...new Set(routes.map(route => route.controller.replace(/Controller$/, "")))]
    .sort()
    .map(name => ({ name })),
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
};

const target = "docs/openapi/backend/v1/generated/all-modules.openapi.json";
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
const inventoryTarget = "docs/openapi/backend/v1/route-inventory.json";
mkdirSync(dirname(inventoryTarget), { recursive: true });
writeFileSync(inventoryTarget, `${JSON.stringify({
  generatedAt: new Date().toISOString().slice(0, 10),
  source: "Spring controller annotations",
  total: routes.length,
  routes,
}, null, 2)}\n`);
console.log(`Generated ${routes.length} routes into ${target}`);
