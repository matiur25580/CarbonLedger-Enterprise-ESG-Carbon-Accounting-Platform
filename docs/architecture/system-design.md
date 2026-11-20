# CarbonLedger — System Design

**Status:** Initial architecture baseline  
**Style:** TypeScript monorepo with a modular monolith API  
**Primary data store:** PostgreSQL

## 1. System boundary

CarbonLedger centralizes sustainability activity data and converts it into traceable emissions calculations, governed workflows and reviewable reports.

The system owns organizations, memberships, facilities, activity records, emission-factor references, calculation snapshots, supplier submissions, evidence metadata, targets, reports and audit events. External systems remain behind integration adapters. Imported data is untrusted until validated and accepted.

## 2. High-level topology

Browser → React + TypeScript web app → Express + TypeScript API → PostgreSQL via Prisma.

The API contains identity and tenant context, organization and facility domains, activity data and emission factors, calculation engine, supplier and evidence workflows, targets, analytics, reporting, audit and integration adapters.

A separate worker, durable queue, private object storage, email and webhook adapters are introduced only when justified by product requirements.

## 3. Domain modules

| Module | Responsibility |
|---|---|
| Identity | Users, sessions, MFA and account lifecycle |
| Tenancy | Organizations, memberships and tenant isolation |
| Organization | Subsidiaries, business units and facilities |
| Activity data | Measured or estimated operational inputs |
| Factor catalogue | Source, geography, unit, validity and version |
| Calculation | Unit normalization and reproducible results |
| Suppliers | Supplier profiles, requests and submissions |
| Evidence | Document metadata, checksums and verification |
| Targets | Baselines, reduction targets and initiatives |
| Reporting | Periods, disclosures, review and exports |
| Audit | Append-only business and security event history |
| Integrations | Imports, API clients, webhooks and adapters |

Modules expose application services rather than reaching into one another's persistence internals.

## 4. Tenant isolation

- Tenant identity is derived from the authenticated server-side session and active membership, never trusted from a request body.
- Every tenant-owned query is scoped by tenant context.
- PostgreSQL Row-Level Security provides defense in depth.
- Tenant context must be set and cleared safely within transaction boundaries; pooled connections must never retain another request's context.
- Roles grant capabilities; resource-level checks enforce facility and record scope.
- Background jobs carry an explicit tenant identifier and revalidate authorization.
- Automated tests attempt cross-tenant reads, writes, exports and object access.

## 5. Calculation lineage

Each calculation snapshot retains the activity record and revision, original quantity and unit, normalized quantity and conversion rule, emission-factor identifier and immutable revision, factor value and unit, geography, source and validity period, formula and engine version, result and timestamp.

Changing an emission factor must not silently rewrite historical results. Recalculation creates a new version and preserves the prior snapshot.

## 6. Data quality

Use explicit workflow states such as DRAFT, SUBMITTED, NEEDS_REVIEW, APPROVED, REJECTED and SUPERSEDED where appropriate. Distinguish measured, estimated, supplier-reported and system-derived values. Missing values must not silently become zero.

## 7. API conventions

- Prefix: /api/v1
- JSON request and response bodies
- Consistent error envelope with stable machine-readable codes
- Request correlation ID
- Cursor pagination for large collections
- Explicit filtering and sorting allowlists
- Idempotency keys for retryable import commands
- OpenAPI contract
- Rate limits on authentication, upload initiation and expensive operations

## 8. Security baseline

Use modern password hashing, short-lived access credentials, rotating and revocable refresh sessions, MFA for privileged roles, CSRF protection where cookie authentication is used, strict CORS, secure headers, request limits, server-side validation, private evidence storage and append-only audit events. Never commit secrets.

## 9. Reliability and observability

Add health and readiness endpoints, structured logs, request correlation, metrics for latency/errors/job retries/calculation volume, bounded retries, idempotent jobs, database backups and a tested restore procedure before making production-readiness claims.

## 10. Architecture decisions

Material decisions belong in docs/architecture/decisions/ with context, decision, alternatives and consequences. Extract a module into a service only when scaling, ownership or reliability evidence justifies the operational cost.
