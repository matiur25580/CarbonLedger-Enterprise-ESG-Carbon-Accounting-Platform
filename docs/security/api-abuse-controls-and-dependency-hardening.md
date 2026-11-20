# Phase 15 — API abuse controls and frontend dependency hardening

## API rate limits

The API now applies three layers of request throttling:

| Surface | Window | Limit |
|---|---:|---:|
| Versioned API business/auth routes | 15 minutes | 300 requests per IP |
| Calculation endpoint | 15 minutes | 30 requests per IP |
| Activity import endpoints | 15 minutes | 20 requests per IP |
| Authentication register/login/refresh | 15 minutes | 10 requests per IP |

Liveness, readiness and metadata endpoints are intentionally mounted before the global business API limiter so infrastructure probes do not consume an application's request budget.

Responses use standardized rate-limit headers and HTTP 429 with the `RATE_LIMITED` error code.

### Operational constraints

The current `express-rate-limit` store is process-local memory. It is suitable as a single-process baseline, not as a distributed quota system. Before running multiple API replicas, configure a shared store such as Redis and test its outage behavior.

The API does not enable Express `trust proxy` globally. If deployment is behind a reverse proxy, configure the exact trusted proxy hop/network in the deployment environment before relying on client-IP quotas. Never set `trust proxy: true` indiscriminately: an untrusted forwarded-for header can undermine IP-based controls.

These limits are coarse IP abuse controls, not organization billing quotas or a substitute for WAF/DDoS protection.

## Vite security update

The web workspace now requests Vite `^6.4.6`, the patched 6.4 release for GHSA-p4f5-76q4-ffq7. The development script no longer binds to `0.0.0.0`; Vite defaults to localhost unless explicitly configured otherwise.

Official advisory: https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7

**Lockfile status:** the repository currently has no `pnpm-lock.yaml`. The version range update does not prove the installed dependency tree is patched until a lockfile is generated, committed and CI uses frozen installation. Run `pnpm install` locally, review the generated lockfile, commit it, then switch CI to `pnpm install --frozen-lockfile`.

## Verification

A regression test sends 31 requests to the calculation limiter and asserts that the 31st request receives HTTP 429. CI must pass before this phase is treated as verified.
