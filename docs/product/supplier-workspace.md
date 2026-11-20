# Supplier sustainability workspace (Phase 14)

The React Suppliers workspace connects to the existing tenant-scoped supplier API. Supplier submissions are retrieved 25 at a time using a UUID cursor, with a stable submitted-time / ID ordering and Previous / Next navigation.

## Internal workspace

- Lists suppliers, questionnaires and the latest 100 submissions.
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
- The UI displays 25 recent submissions per page. Supplier directory search and filtering remain future improvements.
- Supplier invitation email delivery remains manual.
