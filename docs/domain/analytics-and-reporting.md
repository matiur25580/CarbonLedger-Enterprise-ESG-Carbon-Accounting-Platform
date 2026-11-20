# Analytics and reporting (Phase 9)

## Purpose

Provide organization-scoped reporting over immutable calculation results, supplier submissions and reduction planning. All routes require authentication; tenant identity is derived from the authenticated organization and enforced through the tenant transaction context.

## Overview

`GET /api/v1/analytics/overview?from=YYYY-MM-DD&to=YYYY-MM-DD[&facilityId=<uuid>]`

Returns:
- Total calculated kg CO2e and calculation-result count.
- Emissions grouped by Scope 1/2/3 and activity category.
- Facility totals and monthly trend based on activity period start.
- Active supplier coverage: active suppliers with at least one submission, active supplier count, submission count and percentage.
- Reduction targets with the latest saved scenario projection and target comparison.

The date range is inclusive and applies to activity period start. The response is limited to the first 10,000 calculation results and reports `truncated: true` when more rows match. Values are calculated from immutable calculation-result snapshots; they are not a substitute for a formal assurance statement.

## CSV export

`GET /api/v1/analytics/emissions.csv?from=YYYY-MM-DD&to=YYYY-MM-DD[&facilityId=<uuid>]`

Exports up to 10,000 calculation-result rows with activity, facility, factor provenance, engine version and calculation timestamp. CSV cells are quoted and spreadsheet formula-leading values are neutralized. The export contains calculated emissions only; unapproved activities and activities without a valid calculation result are excluded.

## Interpretation limits

- Results represent calculation snapshots created by the calculation engine, not necessarily the latest state of source activity.
- Monthly trend is grouped by activity period start month, not calculation creation month.
- Supplier coverage means at least one submitted questionnaire, not verified supplier emissions coverage or evidence completeness.
- Reduction target progress uses the latest planning scenario, which is based on expected initiative reductions. It is not measured realized reduction.
- No official emission-factor dataset, disclosure-framework certification, or external assurance is implied.
