# Supplier invitation email delivery

## Delivery flow

- Creating an invitation still creates the seven-day, single-use signed portal token; only its SHA-256 digest is stored in the invitation row.
- When Resend is configured, the API encrypts the recipient and message payload (including the one-time portal URL) with AES-256-GCM and inserts a tenant-scoped delivery job in the same transaction as invitation creation.
- The background worker claims due jobs using PostgreSQL `FOR UPDATE SKIP LOCKED`, sends through the Resend HTTPS API, and records SENT/FAILED/PENDING status.
- Provider retries use bounded exponential backoff (30 seconds up to six hours), six maximum attempts, a two-minute processing lease, and the delivery UUID as the provider idempotency key. If a worker crashes during the final attempt, the next poll marks the expired lease FAILED and writes an audit event instead of leaving the job stuck in PROCESSING.
- Delivery outcomes are audit logged. The authenticated delivery-status endpoint intentionally omits encrypted payloads, invitation tokens and provider error details.

## API

- `POST /api/v1/suppliers/:supplierId/invitations` — creates an invitation and queues email when configured. Response contains QUEUED status and no portal token when email is enabled. If email is not configured, the response retains the manual portal token for the existing copy-link workflow.
- `GET /api/v1/suppliers/invitations/:invitationId/delivery` — tenant-scoped delivery status, attempt count and timestamps.

## Configuration

Configure the following on both API and worker processes:

- `RESEND_API_KEY` — Resend API key.
- `EMAIL_FROM` — verified sender address/domain in Resend.
- `SUPPLIER_EMAIL_ENCRYPTION_KEY` — 32 random bytes encoded as 64 hex characters; generate with `openssl rand -hex 32`.
- `WEB_ORIGIN` — public frontend origin; invitation URLs use `/supplier-portal/<token>`.

Do not commit credentials. Keep the encryption key stable across API and worker instances and protect it as a secret. Rotating it requires draining queued messages or providing a deliberate key-version migration. Verify the sender domain with Resend before enabling delivery.

## Delivery semantics and limitations

The queue is durable and at-least-once. Resend's idempotency key reduces duplicate sends when a network failure occurs after provider acceptance. Email delivery status SENT means the provider accepted the message; it does not prove inbox delivery or that the supplier read it. Bounce, complaint and delivery webhooks are not implemented. No email is sent in this repository environment because no provider credentials are configured. If email settings are absent, the system preserves the existing manual-link behavior.
