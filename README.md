# CarbonLedger

**Enterprise ESG, Carbon Accounting & Sustainability Intelligence Platform**

Measure emissions. Govern sustainability data. Track reduction initiatives. Produce evidence-backed reports.

CarbonLedger is an enterprise software project built with the **PERN stack**: PostgreSQL, Express.js, React.js and Node.js. It is designed to help organizations collect activity data, calculate greenhouse-gas (GHG) emissions, manage suppliers and evidence, monitor reduction targets, and prepare structured sustainability disclosures.

> **Project status:** Phase 9 analytics overview and calculation-backed CSV reporting implemented on top of the supplier and reduction workflows.

## Product goals

- Maintain organization-, subsidiary- and facility-level sustainability data.
- Calculate Scope 1, Scope 2 and selected Scope 3 emissions using traceable, versioned emission factors.
- Preserve calculation lineage: source activity, unit conversion, factor source/version, methodology and result.
- Collect supplier and operational data with validation and approval workflows.
- Manage evidence documents and verification history.
- Track emissions baselines, reduction targets and initiatives.
- Produce reviewable reports with data-quality indicators.
- Enforce tenant isolation, least-privilege access and auditable changes.

## Intended users

Sustainability and ESG teams, environmental and compliance officers, facility managers, procurement teams, finance teams, auditors and executive leadership.

## Technology

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend | Node.js 22+, Express 5, TypeScript |
| Database | PostgreSQL 17 |
| ORM and migrations | Prisma |
| Validation | Zod |
| API | Versioned REST (/api/v1) |
| Local infrastructure | Docker Compose |
| CI | GitHub Actions |

## Repository layout

- apps/web — React application
- apps/api — Express API and Prisma schema
- apps/worker — background job runner in a later phase
- packages/* — shared contracts and validation (introduced as domain modules require them)
- docs/architecture — system design and decisions
- docs/product — product requirements and roadmap
- .github/workflows — CI quality gates

## Quick start

**Prerequisites:** Node.js 22+, Corepack/pnpm 10+, and Docker with Compose.

1. Clone the repository and install dependencies:

   `git clone https://github.com/matiur25580/CarbonLedger-Enterprise-ESG-Carbon-Accounting-Platform.git`
   
   `cd CarbonLedger-Enterprise-ESG-Carbon-Accounting-Platform`
   
   `corepack enable`
   
   `pnpm install`

2. Create your local environment file:

   `cp .env.example .env`

3. Start PostgreSQL and generate Prisma Client:

   `pnpm db:up`
   
   `pnpm db:generate`

The Compose initialization script provisions a bootstrap administrator, a non-superuser `carbonledger_migrator`, and a restricted `carbonledger_app` role without `BYPASSRLS` privileges. The API uses only `APP_DATABASE_URL`; Prisma migrations use `DATABASE_URL`; `DATABASE_ADMIN_URL` is reserved for local provisioning and test cleanup. On an already-initialized PostgreSQL volume, apply `infra/postgres/init/01-application-role.sql` manually as the database administrator before starting the API.

4. Apply the initial development migration:

   `pnpm db:migrate`

5. Start the API and frontend:

   `pnpm dev`

   - Web: http://localhost:5173
   - API liveness: http://localhost:4000/api/v1/health/live
   - API readiness: http://localhost:4000/api/v1/health/ready

The local database credentials in `.env.example` are for development only. Never reuse them in a deployed environment.

## Web application and analytics workspace (Phase 12)

The React application now includes organization registration, sign-in, HttpOnly refresh-cookie session restoration, in-memory access-token handling, and a responsive ESG overview dashboard connected to `GET /api/v1/analytics/overview`. It visualizes calculation-backed emissions totals, monthly trend, Scope 1/2/3 mix, facility footprint, supplier submission coverage and reduction scenario snapshots. The reporting period is configurable and users can export the corresponding emissions CSV.

Navigation for Emissions, Activity data, Facilities, Suppliers, Reduction plans and Audit & compliance is currently a product shell; these dedicated frontend workspaces are not yet implemented. No demo emissions values are fabricated. See `docs/product/web-dashboard.md`.

## Activity data and facility workspaces (Phase 13)

The React client now includes organization-scoped facility management and an activity data workspace: create and activate facilities, capture source-linked activity records as drafts, submit records for review, approve/reject submissions according to role, preview and commit validated CSV imports, inspect recent import batches, and calculate approved records through the deterministic calculation API. The UI consumes the existing tenant-aware API; it does not fabricate emission factors or calculated values.

Current frontend limitation: the activity register loads up to the first 100 records and does not yet expose cursor pagination. Binary evidence attachment and dedicated emission-factor catalogue UI remain future work. See `docs/product/activity-data-workspace.md`.

## Identity and organization API (Phase 2)

Authentication endpoints are available under `/api/v1/auth`:

- POST `/register` — create a user and initial organization owner account
- POST `/login` — authenticate and issue a short-lived access token
- POST `/refresh` — rotate the HttpOnly refresh cookie
- POST `/logout` — revoke the current refresh session
- GET `/me` — inspect the authenticated user and selected organization
- GET `/organizations` — list organizations for the authenticated user
- POST `/switch-organization` — switch tenant context and rotate the refresh session
- GET `/organization` — retrieve the selected organization

Tenant member endpoints are under `/api/v1/organizations/current/members`. Only OWNER and ADMIN can update member roles; OWNER cannot be assigned through the role-update endpoint.

Set a strong `JWT_ACCESS_SECRET` (at least 32 characters) in your local `.env`. For HTTPS production deployments set `COOKIE_SECURE=true`. The quick-start migration command applies the committed identity schema and RLS policies.

See `docs/security/identity-and-tenancy.md` for the threat model and production database-role requirements. CI provisions PostgreSQL, applies the migration, and runs a cross-tenant row-level-security integration test.

## Facilities, activity data and factor API (Phase 3)

All endpoints require a valid bearer access token and enforce the selected organization tenant:

- GET/POST `/api/v1/facilities` — list and register facilities
- PATCH `/api/v1/facilities/:facilityId/status` — activate/deactivate a facility (OWNER/ADMIN)
- GET/POST `/api/v1/activity-records` — filter and capture activity records
- PATCH `/api/v1/activity-records/:recordId` — correct your draft/rejected record
- POST `/api/v1/activity-records/:recordId/submit` — submit a draft or rejected record
- POST `/api/v1/activity-records/:recordId/review` — approve/reject a submission (OWNER/ADMIN/AUDITOR; no self-review)
- GET/POST `/api/v1/emission-factors` — browse and create source-backed factor versions
- POST `/api/v1/emission-factors/:factorId/publish` — publish a draft factor (OWNER/ADMIN)
- POST `/api/v1/emission-factors/:factorId/retire` — retire a published factor without editing its provenance (OWNER/ADMIN)

Activity records retain facility, reporting period, quantity, unit, category, scope, source and workflow status. Emission factors retain source name/version, methodology, geography, unit, validity window, uncertainty and immutable version metadata after publication. The initial factor values are organization-managed; no sample or placeholder factor is treated as an authoritative official value. ## Versioned calculation API (Phase 4)

- POST `/api/v1/calculations` — calculate 1–100 unique APPROVED activity records
- GET `/api/v1/calculations?limit=50` — list calculation runs
- GET `/api/v1/calculations/:runId` — retrieve immutable run and result snapshots

The engine uses Decimal arithmetic, a strict unit-conversion registry, country-specific factor preference with GLOBAL fallback, date-valid published factors, deterministic request fingerprints and append-only snapshots. Unsupported units, missing factors and ambiguous factor matches fail closed. No sample emission factors are bundled; organizations must provide source-backed factors. See `docs/domain/calculation-engine.md`.

## Activity data imports (Phase 5)

- POST `/api/v1/activity-imports/preview` — validate CSV data and return row-level quality findings without writing.
- POST `/api/v1/activity-imports/commit` — atomically import valid rows as DRAFT activity records.
- GET `/api/v1/activity-imports` — list tenant-scoped import history.

CSV imports support quoted fields, strict schema/date/quantity/category checks, active facility resolution, in-file and existing-record duplicate detection, 1 MiB/500-row limits, SHA-256 replay protection and auditable batch reports. Invalid or duplicate rows block the entire batch. Imported records use the standard activity submission and review workflow. See `docs/domain/activity-imports-and-quality-controls.md`.

See `docs/domain/activity-data-and-factor-catalogue.md` for the domain rules and API behavior.

## Supplier sustainability portal (Phase 6)

Internal supplier management endpoints are under `/api/v1/suppliers` and require organization authentication:

- GET/POST `/api/v1/suppliers` — list and onboard suppliers (OWNER/ADMIN create).
- PATCH `/api/v1/suppliers/:supplierId/status` — activate/deactivate a supplier.
- GET/POST `/api/v1/suppliers/questionnaires` — list/create versioned questionnaires.
- POST `/api/v1/suppliers/questionnaires/:questionnaireId/publish` — publish a questionnaire.
- POST `/api/v1/suppliers/:supplierId/invitations` — issue a seven-day, single-use portal token for a published questionnaire.
- GET `/api/v1/suppliers/submissions` — review submitted supplier answers.

External supplier endpoints are unauthenticated by organization credentials but require a signed, expiring invitation token:
- GET `/api/v1/suppliers/portal/:token` — retrieve the supplier's questionnaire.
- POST `/api/v1/suppliers/portal/:token/submit` — validate and submit answers once.

Invitation tokens are stored only as SHA-256 hashes, bind supplier/questionnaire/tenant identifiers, expire after seven days, and are single-use. The API returns the token once; delivery is not automated yet (`deliveryStatus: NOT_SENT`). Submission answers are immutable and tenant-scoped. See `docs/domain/supplier-portal.md`.

## Supplier evidence and review workflow (Phase 7)

- POST `/api/v1/suppliers/submissions/:submissionId/evidence` — register evidence object metadata (OWNER/ADMIN/MEMBER/AUDITOR).
- GET `/api/v1/suppliers/submissions/:submissionId/evidence` — list evidence metadata.
- POST `/api/v1/suppliers/submissions/:submissionId/reviews` — append an APPROVED, REJECTED or NEEDS_CHANGES decision (OWNER/ADMIN/AUDITOR).
- GET `/api/v1/suppliers/submissions/:submissionId/reviews` — retrieve the ordered review history.

Evidence metadata records file name, media type, byte size (maximum 50 MiB), SHA-256, storage provider and opaque object key. Binary upload, malware scanning and download delivery are **not** implemented; connect trusted object storage before treating evidence as present or safe. Evidence and review events are tenant-isolated and database-append-only. Each action is audited. See `docs/domain/supplier-evidence-and-reviews.md`.

## Reduction targets, initiatives and scenario analysis (Phase 8)

- POST `/api/v1/reductions/targets` — OWNER/ADMIN create a Scope 1/2/3 target with baseline year, target year, baseline kg CO2e and reduction percentage.
- GET `/api/v1/reductions/targets?limit=50` — list targets with initiatives and recent scenarios.
- POST `/api/v1/reductions/targets/:targetId/initiatives` — OWNER/ADMIN/MEMBER add an initiative with expected annual reduction.
- PATCH `/api/v1/reductions/initiatives/:initiativeId/status` — update initiative status.
- POST `/api/v1/reductions/targets/:targetId/scenarios` — create an immutable planning scenario snapshot.
- GET `/api/v1/reductions/targets/:targetId/scenarios` — list scenario snapshots.

Scenario analysis sums expected reductions from PLANNED, IN_PROGRESS and COMPLETED initiatives, then calculates projected emissions against the target threshold using Decimal arithmetic. These are planning estimates; baseline values are manually supplied and are not yet derived from historical calculation runs or verified measured reductions. See `docs/domain/reduction-targets-and-scenarios.md`.

## Analytics and reporting (Phase 9)

- GET `/api/v1/analytics/overview?from=YYYY-MM-DD&to=YYYY-MM-DD` — tenant-scoped emissions summary by scope, category, facility and month, plus supplier submission coverage and reduction target scenario progress. Optional `facilityId` narrows the report.
- GET `/api/v1/analytics/emissions.csv?from=YYYY-MM-DD&to=YYYY-MM-DD` — export up to 10,000 calculated result rows with activity and emission-factor provenance. Optional `facilityId` narrows the export.

Reports are based on immutable calculation snapshots and clearly distinguish supplier submission coverage and planned target scenarios from verified emissions or realized reductions. See `docs/domain/analytics-and-reporting.md`.

## Webhook integrations and event outbox (Phase 10A)

- POST `/api/v1/webhooks/endpoints` — OWNER/ADMIN register an HTTPS endpoint and subscribe to event types; signing secret is shown once.
- GET `/api/v1/webhooks/endpoints` — list tenant-scoped endpoint metadata.
- PATCH `/api/v1/webhooks/endpoints/:endpointId/disable` — disable an endpoint.
- GET `/api/v1/webhooks/deliveries` — inspect durable delivery queue records.

Supplier questionnaire submissions enqueue `supplier.submission.created` deliveries in the same database transaction as the submission and audit record. Secrets are AES-256-GCM encrypted at rest; configure `WEBHOOK_ENCRYPTION_KEY` using a 32-byte hex key (for example, `openssl rand -hex 32`). Endpoint creation rejects obvious local/private destinations, but complete DNS/IP pinning and egress controls are required before outbound delivery.

**Delivery worker:** a separate runnable worker now claims outbox rows with `FOR UPDATE SKIP LOCKED`, performs HTTPS delivery with DNS/IP validation and pinned connections, signs requests with HMAC-SHA256, and retries with bounded exponential backoff. Run `pnpm --filter @carbonledger/api dev:worker` locally or `pnpm --filter @carbonledger/api worker` after building. The worker is not yet provisioned as a hosted service. Delivery is at-least-once; receivers must deduplicate by event ID. See `docs/domain/webhook-delivery-worker.md`.

## Enterprise audit and compliance center (Phase 11)

- GET `/api/v1/audit/events` — paginated, tenant-scoped audit history for OWNER/ADMIN/AUDITOR, with actor, action, resource, date and event filters.
- GET `/api/v1/audit/export.csv?from=YYYY-MM-DD&to=YYYY-MM-DD` — bounded chronological CSV export with actor identity and recorded metadata.

Exports include an `X-Content-SHA256` digest over the exact CSV bytes, a record count and organization identifier; spreadsheet formula-leading values are neutralized. The digest verifies the downloaded export against its supplied checksum; it is not a persisted hash chain or independent assurance. Audit access remains tenant-scoped and application audit rows are append-only. See `docs/domain/audit-and-compliance-center.md`.

## Engineering commands

- `pnpm typecheck` — TypeScript checks across workspaces
- `pnpm lint` — current static quality checks
- `pnpm test` — workspace tests
- `pnpm build` — production builds
- `pnpm db:studio` — open Prisma Studio

## Architecture principles

1. Modular monolith first; avoid premature microservices.
2. Tenant identity is derived and enforced server-side.
3. PostgreSQL Row-Level Security provides defense in depth.
4. Every calculation is reproducible and retains factor provenance.
5. Reports distinguish measured, estimated, missing and unverified data.
6. Implemented, planned and illustrative functionality are clearly distinguished.

## Engineering roadmap

- [x] Phase 0 — Product scope, architecture and repository foundation
- [x] Phase 1 — Workspace, local infrastructure and quality gates (initial foundation)
- [x] Phase 2 — Identity, organizations and tenant isolation
- [x] Phase 3 — Facilities, activity data and emission-factor catalogue
- [x] Phase 4 — Versioned Scope 1/2/3 calculation engine
- [x] Phase 5 — ESG data collection, imports and data-quality workflows
- [x] Phase 6 — Supplier sustainability portal
- [x] Phase 7 — Evidence metadata and supplier review decisions
- [x] Phase 8 — Targets, initiatives and scenario analysis
- [x] Phase 9 — Analytics and reporting
- [x] Phase 10 — Integrations, webhooks and background processing (worker code; hosted deployment is manual)
- [x] Phase 11 — Compliance audit center and verifiable exports
- [ ] Phase 12 — Security, performance, accessibility and production hardening

See `docs/product/mvp-scope.md` and `docs/architecture/system-design.md`.

## Domain boundary

CarbonLedger is a software engineering demonstration, not an accredited assurance service or legal compliance guarantee. Framework mapping assists reporting workflows; qualified professionals remain responsible for methodology selection, review and external submissions. Emission factors must retain authoritative source, geography, unit and validity metadata.

## License

No license has been selected. Until one is added, all rights are reserved by the repository owner.
