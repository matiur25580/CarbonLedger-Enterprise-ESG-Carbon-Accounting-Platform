# CarbonLedger

**Enterprise ESG, Carbon Accounting & Sustainability Intelligence Platform**

Measure emissions. Govern sustainability data. Track reduction initiatives. Produce evidence-backed reports.

CarbonLedger is an enterprise software project built with the **PERN stack**: PostgreSQL, Express.js, React.js and Node.js. It is designed to help organizations collect activity data, calculate greenhouse-gas (GHG) emissions, manage suppliers and evidence, monitor reduction targets, and prepare structured sustainability disclosures.

> **Project status:** Repository foundation. Capabilities described here are target product scope, not claims that every feature is implemented.

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
| Frontend | React, TypeScript, Vite |
| UI | Tailwind CSS |
| Client data | TanStack Query |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL |
| ORM and migrations | Prisma |
| Validation | Zod |
| API contract | REST and OpenAPI |
| Testing | Vitest/Jest, Supertest, Playwright |
| Local infrastructure | Docker Compose |
| CI | GitHub Actions |

## Architecture principles

1. Modular monolith first; avoid premature microservices.
2. Tenant identity is derived and enforced server-side.
3. PostgreSQL Row-Level Security provides defense in depth.
4. Every calculation is reproducible and retains factor provenance.
5. Reports distinguish measured, estimated, missing and unverified data.
6. Implemented, planned and illustrative functionality are clearly distinguished.

## Repository layout

- apps/web — React application
- apps/api — Express API
- apps/worker — background job runner in a later phase
- packages/contracts — shared API contracts
- packages/validation — shared validation schemas
- docs/architecture — system design and decisions
- docs/product — product requirements and roadmap
- docs/security — security design and threat model
- docs/database — schema and data dictionary
- infra/docker — local infrastructure

## Engineering roadmap

- [ ] Phase 0 — Product scope, architecture and repository foundation
- [ ] Phase 1 — Workspace, local infrastructure and quality gates
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

See docs/product/mvp-scope.md and docs/architecture/system-design.md.

## Domain boundary

CarbonLedger is a software engineering demonstration, not an accredited assurance service or legal compliance guarantee. Framework mapping assists reporting workflows; qualified professionals remain responsible for methodology selection, review and external submissions. Emission factors must retain authoritative source, geography, unit and validity metadata.

## License

No license has been selected. Until one is added, all rights are reserved by the repository owner.
