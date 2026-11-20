# Supplier sustainability portal (Phase 6)

## Supplier registry
Organizations can create suppliers with legal/display name, contact name/email, country, category and optional website. Email uniqueness is enforced within each tenant. OWNER/ADMIN users can create or change supplier status; authenticated members and auditors can list suppliers.

## Questionnaire lifecycle
OWNER/ADMIN users create versioned questionnaires with 1–50 questions. Supported answer types are TEXT, NUMBER, BOOLEAN and CHOICE. Question identifiers must be unique; choice questions require at least two options. Publishing makes a questionnaire eligible for invitations. A new version is created as a new record rather than mutating a prior version.

## Secure portal invitations
An authenticated OWNER/ADMIN issues an invitation for an active supplier and published questionnaire. The API creates a signed HS256 JWT with supplier, organization and invitation identifiers, a seven-day expiry, issuer and audience restrictions. Only the SHA-256 token digest is stored. The raw portal token is returned once and is not emailed by this phase; the response explicitly reports `deliveryStatus: NOT_SENT`.

The supplier opens GET `/api/v1/suppliers/portal/:token` to read the questionnaire, then POSTs `{ "answers": { "question-id": "answer" } }` to `/api/v1/suppliers/portal/:token/submit`. The server verifies the JWT and its database digest, tenant-scoped invitation, expiry, active supplier, published questionnaire and unused state. Required fields, answer types and choice values are validated. The invitation is marked used in the same transaction that stores the immutable submission and audit event. Concurrent/replayed submissions fail.

## Tenant and evidence controls
All supplier, questionnaire, invitation and submission tables enforce PostgreSQL RLS and composite tenant foreign keys. Supplier-provided answers are stored as immutable JSONB submission snapshots. GET `/api/v1/suppliers/submissions` exposes submissions only to authenticated users in the owning organization.

## API limitations
Email delivery, document uploads, questionnaire scoring, supplier risk ratings and internal approve/reject workflows are not included in this phase. They are candidates for the evidence and approvals phase. Invitation tokens should be shared only through a trusted channel and treated as bearer credentials.
