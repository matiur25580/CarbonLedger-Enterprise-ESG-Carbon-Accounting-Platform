# Reduction targets, initiatives and scenario analysis (Phase 8)

## Reduction targets

- POST `/api/v1/reductions/targets` — OWNER/ADMIN create a target with scope, baseline year, target year, baseline kg CO2e and a reduction percentage (0–100, exclusive of zero).
- GET `/api/v1/reductions/targets?limit=50` — list targets, initiatives and recent scenarios in the current tenant.
- The target threshold is calculated as baseline × (1 − reduction percentage / 100).

## Initiatives

- POST `/api/v1/reductions/targets/:targetId/initiatives` — OWNER/ADMIN/MEMBER create an initiative with an expected annual reduction in kg CO2e and optional dates.
- PATCH `/api/v1/reductions/initiatives/:initiativeId/status` — change status to PLANNED, IN_PROGRESS, COMPLETED or CANCELLED.
- Initiative creation and status changes are audited. Expected reductions are planning estimates, not verified measured reductions.

## Scenario snapshots

- POST `/api/v1/reductions/targets/:targetId/scenarios` with a scenario name.
- GET `/api/v1/reductions/targets/:targetId/scenarios` — retrieve immutable snapshots.
- A scenario sums expected annual reductions for PLANNED, IN_PROGRESS and COMPLETED initiatives, subtracts the sum from the baseline, and floors projected emissions at zero. It records the included initiative IDs, assumptions, target threshold and projected value.
- Scenario snapshots are immutable and tenant-isolated. A scenario is a planning model, not a forecast guarantee or an automatically recalculated inventory result.

## Calculation assumptions and limitations

- All persisted quantities use PostgreSQL DECIMAL / Prisma Decimal arithmetic; API inputs are decimal strings to avoid JavaScript floating-point input ambiguity.
- The scope is stored on each target; this initial scenario calculation uses the manually supplied baseline and initiative estimates. It does not yet derive baselines from historical CalculationRun results, apply initiative-specific timelines, discount overlaps, or validate reductions against measured activity data.
- Organizations should document the basis and boundaries of baseline and initiative estimates. This feature does not certify targets or claim alignment with any external target-setting standard.
- All endpoints require authenticated tenant context. Target/initiative creation and status transitions emit audit events.
