# Workspace Instructions

## Project Context

- The active project is located at `/Users/liyi/Desktop/projects1/gongye_ai_plat`.
- Backend code is under `backend/src/main/java/com/wanshen/platform`.
- Backend tests are under `backend/src/test/java`.
- Database migrations are under `backend/src/main/resources/db/migrations`.

## Required Reading

Before implementing or reviewing backend changes, read the stable project
documents:

1. `docs/01 需求规格说明书-工业AI平台-V2.1.0-PRD.md` for business scope and
   acceptance rules.
2. `docs/02 技术设计说明书-工业AI平台-V2.1.0.md`, especially section 4
   “后端架构设计” and section 4.5 “后端实现与验收规范”.
3. `docs/api-contract.md` and `docs/openapi/backend/v1/` for API contracts.
4. Current database migrations for table structure, constraints and indexes.

Do not treat temporary refactor, issue analysis or AI-generated scratch documents
as long-term implementation specifications.

## Backend Architecture

Backend changes must use module-first, layered architecture:

```text
api
  Controller + Request + Response
application
  Application Service + Command + Query
domain
  Aggregate + Entity behavior + Value Object + Repository interface
infrastructure.persistence
  JPA Entity + JPA Repository + Mapper
```

Rules:

- Controller only converts HTTP input to named Command objects and returns
  named Response records.
- Application Service orchestrates domain behavior, repositories and events.
- Domain owns state transitions, invariants and business validation.
- Infrastructure maps domain objects to existing PostgreSQL tables.
- Do not put business rules in Controller.
- Do not create generic stores that mix unrelated aggregates.

## Backend API and DTO Rules

- API input must be a named Request record with Bean Validation annotations.
- API output must be a named Response record.
- Application Service input and output must use named Command/Query/Result types.
- Do not use `JsonNode`, `ObjectNode`, `ArrayNode`, `Map<String, Object>` or
  `Map<String, JsonNode>` for API input, API output, Service input/output or
  aggregate state.
- Do not read business fields through string paths such as `data.path("status")`.
- JPA entities must not be returned directly to clients; use a named Mapper.
- Missing facts must remain unavailable; do not fabricate zero values or
  completed states.

## Backend Persistence Rules

- Prefer existing PostgreSQL tables and columns before creating new ones.
- JPA is the persistence style for new or refactored backend modules.
- JPA entities map to physical tables through explicit table and column names.
- Aggregate children must be persisted as child rows, not JSON arrays.
- Amounts and quantities must use `BigDecimal`.
- Timestamps must use `Instant`.
- Enum values must use `@Enumerated(EnumType.STRING)`.
- Every tenant-owned table and query must enforce `tenant_id`.
- Concurrent updates require optimistic locking or explicit row locking.
- Schema changes must use versioned SQL migrations; do not enable JPA
  auto-generation.

## Data Migration Rules

- `module_document` is legacy transitional storage, not the target fact store
  for new backend modules.
- Before migrating any `module_document(kind)`, identify the existing physical
  table and reuse it where possible.
- Verify tenant, business ID, status, quantity, amount, version and child
  collection counts before switching.
- Do not fabricate missing business facts.
- Do not delete or overwrite historical facts to make migration pass.

## Testing and Verification

Backend changes must pass:

```bash
mvn -f backend/pom.xml clean test
npm run verify:api-contracts
```

Depending on scope, also add or update:

1. Domain state machine tests.
2. Application Service tests.
3. JPA repository PostgreSQL integration tests.
4. Controller tests using named request and response fields.
5. Tenant isolation, permission and concurrent-update tests.
6. Data reconciliation tests.

## Git Version History

- After completing code changes and passing the relevant verification, create
  a Git commit with a clear description of the changes, then push it to the
  project's configured remote repository.
- This workflow is authorized by the user; do not ask for confirmation for
  routine commits and pushes. Required tool permissions still apply.
- Review the diff before committing. Include only changes belonging to the
  current task, and preserve unrelated changes from the user or other tasks.
- If verification, commit, or push fails, explicitly report the failure and
  its cause. Distinguish a local commit from a successful remote push.
- If the project has no remote configured, report that remote backup is not
  available and request the repository address. Do not invent a remote.
- Do not use force pushes or destructive Git commands without explicit user
  authorization.
