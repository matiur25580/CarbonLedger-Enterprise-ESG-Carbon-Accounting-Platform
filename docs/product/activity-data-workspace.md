# Activity data and facility workspaces

## Facility register

The authenticated React workspace lists organization-scoped facilities and supports facility creation and activation/deactivation for OWNER and ADMIN roles. Facility creation captures code, name, ISO-style two-letter country code, city, region and timezone. Activity capture requires an active facility.

## Activity register

The Activity data workspace uses the existing API routes:

- `GET /api/v1/activity-records?limit=100`
- `POST /api/v1/activity-records`
- `POST /api/v1/activity-records/:recordId/submit`
- `POST /api/v1/activity-records/:recordId/review`
- `POST /api/v1/calculations`

The entry form derives the default GHG scope from the selected category, captures quantity/unit, reporting period and source reference, and creates DRAFT records. Owners of their own DRAFT or REJECTED records can submit them. OWNER, ADMIN and AUDITOR users can approve or reject another user's SUBMITTED record. Approved records can be sent to the deterministic calculation endpoint.

Calculation errors are displayed as returned by the API. A published, date-valid factor and supported unit conversion are required; the UI does not invent a factor or estimate an emission result.

## CSV import

The client reads a selected CSV file and sends its text to the server-side preview endpoint. The API enforces its own 1 MiB and 500-row limits, header schema, facility mapping, category/scope checks, date and quantity validation, and duplicate detection. The preview displays the server's quality score and row issues. Commit is enabled only when the server says `canCommit`; the atomic API import creates DRAFT activity records and records the import batch. Replayed content is idempotently recognized by the API.

The template header is:

```csv
facilityCode,category,scope,quantity,unit,periodStart,periodEnd,sourceName,sourceReference,notes
```

## Permissions and limitations

The API remains the source of truth for tenant isolation, permissions, status transitions and validation. The browser only shows actions permitted by the signed-in role and record ownership; the server rechecks every action.

This UI currently loads the first 100 activity records; cursor-based pagination is not yet exposed in this screen. The UI does not attach binary evidence files, edit immutable submitted/approved records, or provide a complete emission-factor catalogue management screen. A successful calculation creates an immutable calculation snapshot; it does not alter the underlying activity record.
