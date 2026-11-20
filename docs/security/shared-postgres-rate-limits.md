# Shared PostgreSQL rate-limit storage

## Modes

- `RATE_LIMIT_STORE=memory` (default): process-local counters for local development and a single API process.
- `RATE_LIMIT_STORE=postgres`: shared counters for every API replica connected to the same PostgreSQL database.

Set the same mode on every API instance. PostgreSQL mode uses the restricted application database role and the `rate_limit_counters` table created by migration `20261120280000_shared_rate_limit_store`.

## Behavior

The store uses parameterized SQL and an atomic `INSERT ... ON CONFLICT DO UPDATE` to increment counters across concurrent processes. Expired windows reset on the next increment. It supports counter lookup, decrement, reset and startup initialization checks. API, calculation and import limiters use independent route prefixes and retain their configured 15-minute windows and limits.

PostgreSQL mode deliberately does not silently fall back to process-local memory: if the migration is missing or the shared database is unavailable, requests using the limiter fail rather than bypassing a configured shared control. Apply migrations before switching the environment setting.

## Operational requirements

1. Apply Prisma migrations before setting `RATE_LIMIT_STORE=postgres`.
2. Configure all API replicas with the same database and setting.
3. Monitor database connection pool pressure because rate-limiter increments add one database operation per limited request.
4. Keep the counter table on the primary database; do not use an asynchronously replicated read replica for writes.
5. The 15-minute expiry index supports cleanup. Expired rows are reset when the same key is next used; schedule a periodic bounded cleanup such as `DELETE FROM rate_limit_counters WHERE reset_at < NOW() - INTERVAL '1 day'` if key churn is high.
6. This is shared application-level throttling, not a substitute for edge/WAF controls or account-level abuse detection.

## Rollout

Keep `RATE_LIMIT_STORE=memory` until the migration has been applied successfully in the target environment. Then change all API replicas together to `postgres` and restart them. Roll back to memory only if operating a single API process; doing so in a multi-replica deployment makes counters independent again.
