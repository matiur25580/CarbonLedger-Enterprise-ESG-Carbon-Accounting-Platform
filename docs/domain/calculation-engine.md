# Calculation engine (Phase 4)

## Calculation contract

CarbonLedger calculates an activity record's gross CO2-equivalent mass as:

`kg CO2e = activity quantity × exact unit-conversion multiplier × emission-factor kg CO2e per factor unit`

Arithmetic uses Prisma Decimal values. No intermediate floating-point conversion or display rounding is applied. Consumers should round only at a presentation/export boundary and retain the stored high-precision result.

## Factor selection

- Only organization-owned factors in PUBLISHED state are eligible.
- The activity reporting-period end date must fall inside the factor's inclusive validity window.
- Category and scope must match exactly.
- A facility-country factor takes precedence over GLOBAL.
- More than one factor at the best geography specificity is an ambiguity error; the engine never silently picks the newest.
- A retired, draft, missing, or date-invalid factor is not selected. Historical calculation snapshots remain available after factor retirement.
- Geography currently uses facility country code with GLOBAL fallback; sub-national matching is deferred.

## Unit conversion

A deliberately explicit registry currently supports Wh/kWh/MWh/GWh, g/kg/tonne/t and L/m3 conversions. Identical unit strings are accepted without conversion. Unknown units and cross-dimensional conversions fail closed. This is not an implicit assumption that similarly named units are equivalent; factor and activity units must match or have a registered conversion.

## Reproducibility and controls

- Only APPROVED activity records can be calculated.
- Each run records the engine version, deterministic fingerprint, actor and per-activity immutable snapshot.
- Snapshots preserve activity values, facility geography, selected factor ID/code/version, factor value, source name/URL/version, methodology, validity, uncertainty and conversion path.
- The fingerprint makes repeated requests for the same unchanged activity set idempotent. Changed activity data creates a different fingerprint and a new run.
- Calculation runs and results are append-only at the database layer. Recalculation means creating a new run; it never edits history.
- Run and result tables use tenant RLS and composite organization foreign keys.

## API

- POST `/api/v1/calculations` with `{ "activityRecordIds": ["..."] }` (1–100 unique approved records)
- GET `/api/v1/calculations?limit=50`
- GET `/api/v1/calculations/:runId`

A missing/ambiguous factor, unsupported unit, or non-approved activity prevents the request from producing a partial run. No official emission-factor dataset is bundled; organizations must enter and publish sourced factors before calculating. This engine is an auditable calculation foundation, not a guarantee of GHG Protocol conformance or assurance.
