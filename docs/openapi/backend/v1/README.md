# Backend API v1 contract workspace

`route-inventory.json` is the generated baseline of every Spring MVC route. It is the authoritative
coverage checklist while module OpenAPI files are being completed.

`generated/all-modules.openapi.json` is the generated route-level OpenAPI document for all Spring MVC
routes. Regenerate it after adding or moving a controller route:

```bash
npm run generate:api-contracts
npm run verify:api-contracts
```

Curated module YAML files add P0 command detail. The generated document is the route coverage baseline;
where both exist, the curated contract must remain compatible with the generated route.

Curated field-level module contracts:

- [ai.yaml](ai.yaml)
- [message.yaml](message.yaml)
- [personnel.yaml](personnel.yaml)
- [supply-chain.yaml](supply-chain.yaml)
- [inventory-master.yaml](inventory-master.yaml)
- [platform-compat.yaml](platform-compat.yaml)
- [production-client.yaml](production-client.yaml)
- [production-bom-demand.yaml](production-bom-demand.yaml)
- [finance-closure.yaml](finance-closure.yaml)
- [workbench.yaml](workbench.yaml)

Status:

- `public` routes must receive a complete OpenAPI operation.
- `internal` routes are worker/import callbacks and must never be exposed through the browser.
- `retired` routes remain implemented only to return an explicit migration error.
- Module YAML files under this directory will progressively replace the partial root-level contracts.
