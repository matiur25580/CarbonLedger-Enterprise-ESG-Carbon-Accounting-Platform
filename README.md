# CarbonLedger

**Enterprise ESG, Carbon Accounting & Sustainability Intelligence Platform**

Measure emissions. Govern sustainability data. Track reduction initiatives. Produce evidence-backed reports.

CarbonLedger is an enterprise software project built with the **PERN stack**: PostgreSQL, Express.js, React.js and Node.js. It is designed to help organizations collect activity data, calculate greenhouse-gas (GHG) emissions, manage suppliers and evidence, monitor reduction targets, and prepare structured sustainability disclosures.

> **Project status:** Phase 6 supplier sustainability portal implemented on top of the Phase 5 tenant-scoped activity import workflow.

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

Invitation tokens are stored only as SHA-256 hashes, bind supplier/questionnaire/tenant identifiers, expire after seven days, and are single-use. The API returns the token once; delivery is not automated yet (`deliveryStatus: NOT_SENT`). Submission answers are immutable and tenant-scoped. This phase records submissions; review/evidence workflows follow in Phase 7. See `docs/domain/supplier-portal.md`.

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
- [ ] Phase 7 — Evidence management and approvals
- [ ] Phase 8 — Targets, initiatives and scenario analysis
- [ ] Phase 9 — Analytics and reporting
- [ ] Phase 10 — Integrations, webhooks and background processing
- [ ] Phase 11 — Security, performance, accessibility and production delivery

See `docs/product/mvp-scope.md` and `docs/architecture/system-design.md`.

## Domain boundary

CarbonLedger is a software engineering demonstration, not an accredited assurance service or legal compliance guarantee. Framework mapping assists reporting workflows; qualified professionals remain responsible for methodology selection, review and external submissions. Emission factors must retain authoritative source, geography, unit and validity metadata.

## License

No license has been selected. Until one is added, all rights are reserved by the repository owner.
