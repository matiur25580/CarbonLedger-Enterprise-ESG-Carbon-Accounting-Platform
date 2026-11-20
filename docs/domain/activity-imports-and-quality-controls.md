# Activity data imports and quality controls (Phase 5)

CarbonLedger accepts controlled CSV imports for activity records. Imports are tenant-scoped, validated before writing, duplicate-aware, and committed atomically.

## CSV contract

Required columns: `facilityCode,category,scope,quantity,unit,periodStart,periodEnd,sourceName`.

Optional columns: `sourceReference,notes`. Header names are case-sensitive. Dates use ISO `YYYY-MM-DD`; quantity must be a positive finite decimal; category and scope use the API enum values. Category/scope compatibility follows the same guardrails as manually captured activity records.

The parser supports RFC-4180-style quoted fields, escaped double quotes, commas and newlines inside quoted fields. Files are limited to 1 MiB and 500 data rows.

## Workflow

1. POST `/api/v1/activity-imports/preview` with `{ "fileName": "utility.csv", "csvText": "..." }`.
2. Review row-level errors, facility references and duplicate findings. Preview performs no writes.
3. POST `/api/v1/activity-imports/commit` with the same payload. The server revalidates against current tenant data inside a transaction.
4. A successful batch creates all draft activity records and an immutable-by-convention import report in one database transaction. A repeated identical file in the same organization is idempotently returned rather than imported twice.

The commit is all-or-nothing: invalid rows or duplicates prevent all writes. Duplicate detection covers repeated rows in the file and exact matching activity records already in the organization. Imported records remain DRAFT and must follow the normal submit/review workflow before they can be calculated.

## API

- POST `/api/v1/activity-imports/preview` — validate and return a preview without persistence.
- POST `/api/v1/activity-imports/commit` — atomically create draft records and an import batch.
- GET `/api/v1/activity-imports` — list recent tenant-scoped import batches.

All endpoints require authentication and OWNER/ADMIN/MEMBER role. The tenant is derived from the authenticated context; CSV content cannot select an organization. Each batch stores the SHA-256 file digest, row counts, file name and row-level quality report. Activity rows reference their import batch through a composite organization foreign key. PostgreSQL RLS protects the batch table.
