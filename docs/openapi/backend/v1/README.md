# Backend API v1 contract workspace

`route-inventory.json` is the generated baseline of every Spring MVC route. It is the authoritative
coverage checklist while module OpenAPI files are being completed.

Status:

- `public` routes must receive a complete OpenAPI operation.
- `internal` routes are worker/import callbacks and must never be exposed through the browser.
- `retired` routes remain implemented only to return an explicit migration error.
- Module YAML files under this directory will progressively replace the partial root-level contracts.
