# Facility, activity data and emission-factor catalogue

## Tenant-owned facilities

A facility belongs to exactly one organization. Its code is unique within that organization and normalized to uppercase by the API. Country is an ISO-style two-letter uppercase code; timezone defaults to UTC. Facilities can be deactivated without deleting historical activity data.

## Activity records

Each activity record stores:
- Facility and tenant identifiers
- Activity category and GHG Protocol scope classification
- Positive quantity and explicit unit string
- Inclusive reporting-period start and end dates
- Source name, optional source reference and optional notes
- Creator, submission timestamp, reviewer and review timestamp
- Workflow state: DRAFT, SUBMITTED, APPROVED or REJECTED

Initial category/scope guardrails map purchased electricity to Scope 2; stationary/mobile fuel and refrigerants to Scope 1; and business travel, waste, water, purchased goods and freight to Scope 3. OTHER is intentionally flexible and requires organization methodology review. This is an intake guardrail, not a complete GHG Protocol classification engine.

A contributor can submit their own DRAFT or REJECTED record. OWNER, ADMIN or AUDITOR can approve/reject a submitted record, but cannot review their own submission. A rejection can be corrected and resubmitted. Every create, submit and review action creates an audit event in the same transaction.

## Emission-factor versions

Factors are organization-managed in this phase. A factor version records:
- Stable factor code and monotonically increasing version
- Activity category, scope, unit and geography code
- kg CO2e per stated unit, stored as high-precision decimal
- Source name, optional source URL, source version and methodology
- Optional uncertainty percentage
- Valid-from and optional valid-to dates
- Draft, published or retired status and publication timestamp

Only OWNER/ADMIN can create, publish or retire factors. Publishing freezes all scientific and provenance metadata at the database layer. A published version may only be retired; a retired version cannot be reactivated. Corrections require creating a new version under the same factor code. The API deliberately does not edit published values in place.

No factor is implicitly selected for an activity and no CO2e result is calculated in Phase 3. Phase 4 will define deterministic unit conversion, factor selection by geography and reporting date, calculation lineage and immutable result snapshots.

## Database controls

The migration adds tenant RLS to facilities, activity_records and emission_factors. Activity records reference facilities through a composite (facility_id, organization_id) foreign key, preventing cross-tenant facility association even if an application query is defective. Database CHECK constraints enforce positive quantities, valid date ordering, non-negative factor values, bounded uncertainty and factor publication state.

## API routes

All routes require a bearer access token:
- GET/POST /api/v1/facilities
- PATCH /api/v1/facilities/:facilityId/status
- GET/POST /api/v1/activity-records
- POST /api/v1/activity-records/:recordId/submit
- POST /api/v1/activity-records/:recordId/review
- GET/POST /api/v1/emission-factors
- POST /api/v1/emission-factors/:factorId/publish
- POST /api/v1/emission-factors/:factorId/retire

Pagination and CSV ingestion are intentionally deferred; current activity listing is capped at 100 records per request. Global authoritative factor datasets and licensing/attribution review are also future work.
