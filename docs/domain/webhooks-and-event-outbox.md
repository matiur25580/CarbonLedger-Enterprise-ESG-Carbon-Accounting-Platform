# Webhook endpoints and transactional outbox

## Endpoint management

All routes are authenticated under `/api/v1/webhooks`.

- `POST /endpoints` (OWNER/ADMIN): register a public HTTPS destination and 1–20 event types.
- `GET /endpoints` (all organization roles): list endpoint metadata; signing material is never returned.
- `PATCH /endpoints/:endpointId/disable` (OWNER/ADMIN): disable an endpoint.
- `GET /deliveries?status=PENDING&limit=50` (all organization roles): inspect delivery queue state.

A newly registered endpoint receives a cryptographically random signing secret exactly once. The secret is encrypted at rest with AES-256-GCM; the 32-byte key is supplied as 64 hexadecimal characters in `WEBHOOK_ENCRYPTION_KEY`. Generate a key with `openssl rand -hex 32`. Back it up in a secrets manager; losing it requires rotating endpoint secrets. The API does not expose a secret retrieval endpoint.

Only HTTPS URLs with a hostname are accepted. Obvious local, private-IP-literal and internal hostnames are rejected at registration. This is an initial guard, not a complete SSRF defense: before outbound delivery is enabled, the worker must resolve DNS, reject loopback/private/link-local/reserved IPv4 and IPv6 addresses, pin the validated address for the connection, revalidate redirects (or disable redirects), enforce response/time/size limits, and defend against DNS rebinding.

## Event outbox

Supplier questionnaire submission emits `supplier.submission.created`. In the same PostgreSQL transaction as the submission and audit log, matching enabled endpoints receive durable PENDING delivery rows. This avoids the dual-write gap between committing business data and enqueueing the corresponding integration event.

Delivery rows are tenant-scoped, reference endpoints through a composite organization foreign key, and include event ID/type, JSON payload, attempt count and scheduling/response fields. The queue is currently observable but not yet consumed: no HTTP delivery worker, retry scheduler, HMAC request signing, dead-letter handling or production external-destination verification is included in this increment. Do not interpret PENDING rows as delivered.

## Planned worker contract

The worker should claim due rows with PostgreSQL `FOR UPDATE SKIP LOCKED`, commit a short lease before network I/O, send a timestamped HMAC-SHA256 signature over the exact request body, and record response status. It should use bounded exponential backoff with jitter, a maximum attempt count, lease recovery for crashed workers, strict egress/SSRF controls and idempotent event IDs. A successful HTTP response should be the only transition to DELIVERED.
