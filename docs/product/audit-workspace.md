# Audit and compliance workspace

## Access and purpose

The authenticated dashboard exposes a read-only audit workspace to organization members with the OWNER, ADMIN or AUDITOR role. Other roles see an access explanation; the API remains the enforcement boundary.

## Event history

The workspace calls `GET /api/v1/audit/events` with a required date range and optional exact `action` and `resourceType` filters. It displays paginated results (50 per page), actor identity when available, event action, resource reference, timestamp and expandable recorded metadata. Results remain tenant-scoped by the API.

## CSV export

The export action calls `GET /api/v1/audit/export.csv` for the selected date range and optional action/resource filters. The API caps exports at 5,000 events and returns `X-Content-SHA256` and `X-Export-Record-Count` headers. The UI displays these values after download.

The SHA-256 digest is a check over the exact CSV bytes, not a persisted hash chain, independent timestamp, regulatory certification or independent assurance. Review metadata before sharing exports externally.

## Operational boundaries

- The workspace does not create, edit or delete audit events.
- The API enforces OWNER, ADMIN and AUDITOR access and tenant scoping.
- The date range and filters are applied server-side.
- Exports exceeding 5,000 matching events must be narrowed.
