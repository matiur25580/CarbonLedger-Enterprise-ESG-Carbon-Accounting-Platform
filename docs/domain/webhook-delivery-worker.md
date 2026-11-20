# Webhook delivery worker

## Run locally

The worker is a separate long-running process and shares the API's PostgreSQL database:

```bash
# Generate a key once and store it in your deployment secret manager
openssl rand -hex 32

# Set WEBHOOK_ENCRYPTION_KEY to the same 64-hex-character value used by the API
pnpm --filter @carbonledger/api dev:worker
```

For a production build, run the repository build first, then start `pnpm --filter @carbonledger/api worker`. The worker requires `APP_DATABASE_URL` and `WEBHOOK_ENCRYPTION_KEY`; the current shared environment loader also validates the API's standard required settings.

## Delivery behavior

- Polls organizations and claims due rows in small batches using PostgreSQL `FOR UPDATE SKIP LOCKED`.
- Claims are committed before network I/O. A two-minute processing lease allows recovery after a worker crash.
- Posts the exact stored JSON payload with `X-CarbonLedger-Event`, `X-CarbonLedger-Event-Id`, `X-CarbonLedger-Timestamp` and `X-CarbonLedger-Signature: v1=<hex>`.
- Signature is HMAC-SHA256 over `<unix-timestamp>.<exact-request-body>`; receivers should compare signatures in constant time and reject stale timestamps/replayed event IDs.
- Only 2xx responses are marked DELIVERED. Other outcomes retry with exponential backoff and jitter, up to eight attempts, then become FAILED.
- Redirects are not followed. Requests use HTTPS, certificate verification, a 10-second timeout, 256 KiB request limit and 16 KiB response limit.
- DNS is resolved before connecting; every returned address must be globally routable. The selected validated address is pinned into the TLS connection to reduce DNS-rebinding risk. Loopback/private/link-local/reserved/documentation destinations are rejected.
- SIGINT/SIGTERM stop new polling and let the in-flight request finish; abandoned PROCESSING leases become eligible for recovery after two minutes.

## Operational notes and limitations

Run at least one worker instance with network egress to PostgreSQL and the public internet. Multiple instances can run concurrently because claims use row locks with SKIP LOCKED. Monitor FAILED deliveries and endpoint health. A worker crash after the receiver accepts a request but before the database records DELIVERED can cause a duplicate on lease recovery; consumers must deduplicate using the stable `X-CarbonLedger-Event-Id`. This is at-least-once delivery, not exactly-once delivery.

The worker is committed as a runnable process, but this repository change does not provision or deploy a hosted worker service. Configure the same `WEBHOOK_ENCRYPTION_KEY` on API and worker deployments. Keep that key backed up; changing it without rotating endpoint secrets makes existing endpoints undecryptable.
