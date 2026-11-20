# CarbonLedger — Product Scope

## Product statement

CarbonLedger helps multi-site organizations collect sustainability activity data, calculate traceable greenhouse-gas emissions, manage evidence and review progress against reduction targets.

## Primary personas

| Persona | Primary needs |
|---|---|
| Organization administrator | Configure organization, users, facilities and access |
| Sustainability manager | Collect data, manage factors, run calculations and prepare reports |
| Facility contributor | Submit energy, fuel, waste and travel activity |
| Supplier contact | Respond to scoped data requests and provide evidence |
| Reviewer / auditor | Inspect provenance, evidence, approvals and calculation lineage |
| Executive | Understand trends, targets, coverage and key risks |

## MVP outcomes

1. An organization can securely onboard users and facilities.
2. Contributors can submit activity data with units, period, source and evidence references.
3. Authorized users can select a valid, versioned emission factor.
4. The calculation engine produces reproducible CO2e results with complete lineage.
5. Reviewers can approve, reject or request corrections.
6. Users can view emissions by period, scope, facility and activity category.
7. Exports identify estimates, missing data and unverified submissions.

## Functional scope

### Identity and tenancy
- Invitation-based onboarding, login and logout
- Session revocation
- Organization membership and role assignment
- Tenant-scoped API and database access

### Organization and facilities
- Organization profile
- Business units and facilities
- Facility location and operational metadata
- Facility activation and deactivation
- Tenant-scoped facility access

### Activity data
- Stationary and mobile fuel, purchased electricity, refrigerants, waste, business travel and selected Scope 3 categories
- Quantity, unit, reporting period, facility, source and notes
- Draft, submit, approve and reject workflow with reviewer attribution
- Reporting-period overlap filters and tenant-isolation checks
- Draft, submit, review and correction lifecycle
- CSV import with row-level validation feedback

### Emission factors and calculation
- Organization-managed factor catalogue with source and publication metadata
- Versioned factors with geography, unit, category, scope and validity period
- Draft, publish and retire lifecycle; published versions are immutable
- Provenance: source name/version, methodology, optional URL and uncertainty
- Factor values are metadata only until Phase 4 calculation engine is implemented
- Explicit unit conversion
- Deterministic calculation service
- Immutable calculation snapshots and recalculation history
- Tests for units, rounding, factor selection and boundary dates

### Reporting and analytics
- Scope 1 / Scope 2 / selected Scope 3 summaries
- Period and facility filters
- Data coverage and quality indicators
- CSV export and printable report
- Baseline and target progress foundation

### Evidence and audit
- Evidence metadata and private storage adapter
- Checksum and document version metadata
- Verification status
- Audit history for submissions, approvals and calculation changes

## Out of scope for the first MVP

- Claiming automated legal or regulatory compliance
- Carbon credit trading or offset marketplace
- Unreviewed autonomous AI decisions
- Direct write access to customer ERP systems
- Production IoT device control
- Full coverage of every Scope 3 category on day one
- Certification or third-party assurance

## Acceptance principles

- No cross-tenant data access in API or database tests.
- Every result traces to its activity and factor revision.
- Missing or invalid source data is visible and cannot silently become zero.
- Imports are idempotent or detect duplicate submissions.
- Critical workflows have unit and integration tests.
- API errors are consistent and actionable.
- UI supports loading, empty, error and permission-denied states.
- Documentation accurately labels implemented versus planned features.

## Delivery sequence

1. Workspace and local development environment
2. Identity, tenancy and organization setup
3. Facilities and activity data
4. Factor catalogue and calculation engine
5. Review workflow and evidence
6. Analytics and reporting
7. Supplier portal and integrations
8. Production hardening
