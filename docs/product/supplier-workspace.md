# Supplier sustainability workspace (Phase 14)

The React Suppliers workspace connects to the existing tenant-scoped supplier API. The supplier directory supports case-insensitive search across supplier name, contact name, email, category and country code, ACTIVE / INACTIVE filtering, and 25-row UUID cursor pagination with stable name / ID ordering. Supplier submissions are retrieved 25 at a time using a UUID cursor, with stable submitted-time / ID ordering and Previous / Next navigation.

## Internal workspace

- Lists a searchable, filterable, cursor-paginated supplier directory, questionnaires and 25 submissions per page.
- OWNER/ADMIN can onboard suppliers, activate/deactivate them, create questionnaire versions, publish questionnaires and issue invitations.
- Questionnaire editor supports TEXT, NUMBER, BOOLEAN and CHOICE questions, required flags and editable question labels.
- Invitations are single-use, expire after seven days, and are shown once as a copyable portal URL. Email delivery is not configured; the link must be sent through an approved channel.
- Supplier answers are displayed as immutable submission data. OWNER/ADMIN/AUDITOR can append APPROVED, REJECTED or NEEDS_CHANGES review decisions and comments.
- Evidence references can be registered with filename, media type, size, SHA-256, storage provider and object key.

## External supplier portal

The public route `/supplier-portal/:token` loads the questionnaire from `GET /api/v1/suppliers/portal/:token` and submits validated answers to `POST /api/v1/suppliers/portal/:token/submit`. It does not require an organization session. The API validates invitation signature, expiry, single-use state, active supplier status and answer types. The frontend renders TEXT, NUMBER, BOOLEAN and CHOICE controls.

## Security and operational boundaries

- The API remains authoritative for tenant isolation, permissions, invitation validation and answer validation.
- Invitation URLs are credentials: show them only once, distribute privately and never place them in public logs or tickets.
- The invitation token is not persisted in browser storage by this workspace.
- Review decisions are append-only; answers remain immutable.
- Evidence UI registers metadata only. It does not upload binary files, verify that an object exists, scan for malware, or provide downloads. Only register references after trusted object storage has accepted and scanned the object.
- The UI displays 25 recent submissions and 25 suppliers per page. Supplier directory search and status filtering are applied server-side; total matching count is shown.
- Supplier invitation email delivery remains manual.


## Supplier review health analytics

Authenticated users with supplier-directory access can retrieve the operational review-health view from `GET /api/v1/analytics/supplier-review-health`.

- Supports case-insensitive supplier search, ACTIVE / INACTIVE filtering, bounded 1–100 page sizes (default 25), and UUID cursor pagination with stable name / ID ordering.
- Returns each supplier's total submission count, latest submission timestamp, latest submission review decision, evidence count and latest evidence-review decision counts.
- Engagement states are workflow states only: `NO_SUBMISSION`, `AWAITING_REVIEW`, `APPROVED`, `REJECTED` and `NEEDS_CHANGES`. They are not ESG scores, emissions performance ratings or compliance certifications.
- Evidence review counts inspect at most the latest 100 evidence items per latest submission. The response exposes `evidenceReviewSampleTruncated` when more evidence exists.
- All queries execute within the authenticated organization tenant context. The endpoint is read-only and does not change submissions, evidence or review history.
