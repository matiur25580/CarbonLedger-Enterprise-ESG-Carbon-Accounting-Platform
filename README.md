# CarbonLedger

**Enterprise ESG, Carbon Accounting & Sustainability Intelligence Platform**

Measure emissions. Govern sustainability data. Track reduction initiatives. Produce evidence-backed reports.

CarbonLedger is an enterprise software project built with the **PERN stack**: PostgreSQL, Express.js, React.js and Node.js. It is designed to help organizations collect activity data, calculate greenhouse-gas (GHG) emissions, manage suppliers and evidence, monitor reduction targets, and prepare structured sustainability disclosures.

> **Project status:** Phase 1 engineering foundation. Product capabilities described below are target scope unless explicitly marked implemented.

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

4. Apply the initial development migration:

   `pnpm db:migrate --name init`

5. Start the API and frontend:

   `pnpm dev`

   - Web: http://localhost:5173
   - API liveness: http://localhost:4000/api/v1/health/live
   - API readiness: http://localhost:4000/api/v1/health/ready

The local database credentials in `.env.example` are for development only. Never reuse them in a deployed environment.

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
- [ ] Phase 2 — Identity, organizations and tenant isolation
- [ ] Phase 3 — Facilities, activity data and emission-factor catalogue
- [ ] Phase 4 — Versioned Scope 1/2/3 calculation engine
- [ ] Phase 5 — ESG data collection, imports and data-quality workflows
- [ ] Phase 6 — Supplier sustainability portal
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
