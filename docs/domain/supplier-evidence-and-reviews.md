# Supplier evidence and review workflow (Phase 7)

Phase 7 adds tenant-scoped evidence metadata and append-only review decisions for supplier questionnaire submissions.

## Evidence metadata

- POST `/api/v1/suppliers/submissions/:submissionId/evidence` — register metadata for an object already stored in an approved storage service.
- GET `/api/v1/suppliers/submissions/:submissionId/evidence` — list evidence metadata.
- Metadata includes original file name, media type, byte size, SHA-256 digest, storage provider, opaque object key and optional description.
- Registration is limited to 50 MiB per object. SHA-256 is normalized to lowercase.
- The API does **not** receive, upload, scan, download or serve binary file contents. A trusted storage integration and malware/content scanning must be configured separately. Do not treat metadata registration as proof that a file exists or is safe.
- Evidence rows are tenant-isolated and append-only at the database layer. The composite submission foreign key prevents cross-tenant association.

## Review decisions

- POST `/api/v1/suppliers/submissions/:submissionId/reviews` — record APPROVED, REJECTED or NEEDS_CHANGES with an optional reviewer comment.
- GET `/api/v1/suppliers/submissions/:submissionId/reviews` — retrieve the complete ordered review history.
- OWNER, ADMIN and AUDITOR can record decisions. OWNER, ADMIN, MEMBER and AUDITOR can read evidence and review history.
- Each decision creates a new immutable review event; earlier decisions are never overwritten. The latest event represents the current recorded decision, but it does not mutate the original supplier response.
- Every registration and decision emits an organization audit event.

All routes require an authenticated organization context. The external single-use supplier invitation endpoints remain public and token-protected.
