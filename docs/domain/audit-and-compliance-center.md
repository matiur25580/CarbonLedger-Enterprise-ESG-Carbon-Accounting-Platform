# Enterprise audit and compliance center

## Purpose

The audit center gives organization owners, administrators and auditors a tenant-scoped view of recorded platform activity, with bounded CSV exports suitable for review workpapers and evidence hand-off.

## API

All endpoints require an authenticated organization membership with the OWNER, ADMIN or AUDITOR role.

- `GET /api/v1/audit/events` — paginated audit history. Optional filters: `from`, `to` (YYYY-MM-DD), `action`, `resourceType`, `actorUserId`; `limit` (1–100, default 50) and `offset` (0–10,000).
- `GET /api/v1/audit/export.csv?from=YYYY-MM-DD&to=YYYY-MM-DD` — export up to 5,000 matching events, optionally filtered by `action` and `resourceType`.

The list response includes actor identity, event action, resource reference, timestamp and recorded metadata. Results are ordered newest first. CSV exports are ordered oldest first for chronological review and include actor identity and JSON metadata.

## Export integrity and safe handling

The CSV response includes `X-Content-SHA256`, `X-Export-Record-Count` and `X-Export-Organization` headers. The SHA-256 value is calculated over the exact UTF-8 CSV response bytes; reviewers can independently hash the downloaded file and compare it with the header value. CSV cells are quoted and spreadsheet formula-leading values are neutralized.

The digest proves whether a downloaded export matches the digest supplied with that export. It is **not** a persisted hash chain, an independently anchored timestamp, or proof that the underlying database has never been altered. Audit rows are append-only for the application database role and protected by tenant row-level security; production assurance still requires protected backups, restricted database administration, monitoring and independent retention controls.

Exports are capped at 5,000 events to bound memory and response size. Narrow the requested period or filters for larger reviews. Metadata reflects the audit payload recorded by each workflow and should be reviewed before external disclosure.

## Operational notes

- Use the AUDITOR role for read-only compliance access; OWNER and ADMIN can also inspect audit history.
- Every query runs inside the selected tenant transaction and is additionally constrained by organization ID.
- The endpoint does not create, modify or delete audit records.
- Do not describe a CSV digest as regulatory certification or independent assurance.
