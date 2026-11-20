# Pre-deployment readiness checklist

This checklist is an operator handoff, not a deployment action. CarbonLedger has not been deployed or provisioned by this project workflow. Complete and verify every applicable item in the target environment before exposing the application to users.

## Release gates

### 1. Reproducible build and supply chain

- [ ] Manually run [Bootstrap pnpm lockfile](../../.github/workflows/bootstrap-lockfile.yml) from GitHub Actions on `main`. It generates the lockfile with lifecycle scripts disabled, verifies frozen installation, runs the database-backed typecheck/lint/test/build gates, and commits the lockfile plus the frozen-CI change.
- [ ] After the workflow succeeds, verify `pnpm-lock.yaml` is present on `main` and the next regular CI run succeeds with `pnpm install --frozen-lockfile`.
- [x] Pin third-party GitHub Actions in `.github/workflows/ci.yml` to immutable full commit SHAs.
- [x] Enable weekly Dependabot updates for pnpm dependencies and GitHub Actions.
- [ ] Review each Dependabot PR and security advisory; do not auto-merge unreviewed dependency changes.
- [ ] Run dependency, license and secret scans against the exact release commit; resolve or formally accept findings.

### 2. Secrets and application configuration

Set unique, high-entropy values in the chosen secret manager. Never commit real values or reuse CI/example credentials.

- [ ] `JWT_ACCESS_SECRET`: at least 32 characters; rotate from any development value.
- [ ] `COOKIE_SECURE=true` behind HTTPS.
- [ ] `APP_DATABASE_URL`: restricted runtime database role, no superuser or `BYPASSRLS`.
- [ ] `DATABASE_URL`: migration-only role with required DDL privileges; do not expose to the runtime service.
- [ ] `DATABASE_ADMIN_URL`: provisioning/administration only; do not expose to the application.
- [ ] `WEBHOOK_ENCRYPTION_KEY`: exactly 32 bytes / 64 hex characters, shared only by API and worker, backed up securely and rotated with a documented re-encryption plan.
- [ ] Configure production CORS origins, frontend API base URL, allowed hosts and environment-specific settings.
- [ ] Verify secrets are not exposed through frontend build variables, logs, error responses or CI artifacts.

### 3. Database and tenant isolation

- [ ] Provision PostgreSQL using a supported version and private network access.
- [ ] Create runtime and migration roles using the repository's role-provisioning SQL, then verify role attributes and grants.
- [ ] Apply committed Prisma migrations in a controlled release step; take a tested backup first.
- [ ] Verify RLS is enabled and forced where required, and runtime role cannot bypass it.
- [ ] Run tenant-isolation integration tests against the production-like role, not only an administrator connection.
- [ ] Configure automated backups, retention, encryption and point-in-time recovery where supported.
- [ ] Perform a restore rehearsal and document recovery time and recovery point objectives.
- [ ] Define migration rollback/forward-fix procedures; do not assume every schema migration is safely reversible.

### 4. Network, proxy and API abuse controls

- [ ] Terminate TLS at a trusted ingress/load balancer and redirect HTTP to HTTPS.
- [ ] Configure Express `trust proxy` only for the exact trusted proxy topology; never enable unrestricted proxy trust.
- [ ] Current API rate limiters use process-local memory. Before multiple API replicas, configure a shared rate-limit store and test consistent client identity across replicas.
- [ ] Set explicit production CORS allowlists and verify cookie credentials/CSRF protections for the chosen browser topology.
- [ ] Verify webhook endpoints are HTTPS-only, signing keys are protected, and egress policy blocks internal/private destinations.
- [ ] Set ingress request-size, timeout and connection limits appropriate to API and import workloads.

### 5. Background worker and integrations

- [ ] Run the webhook worker as a separate managed process using the same database and webhook encryption key as the API.
- [ ] Ensure worker replicas safely coordinate through database claims and stale-lease recovery.
- [ ] Monitor delivery backlog, retry exhaustion, permanent failures and worker heartbeat.
- [ ] Implement an approved notification channel for supplier invitations; current invitation delivery is manual.
- [ ] Configure webhook consumer idempotency using the event ID; delivery is at-least-once, not exactly-once.

### 6. Evidence and product capability boundaries

- [ ] Choose private object storage, upload authorization, malware scanning, checksum verification, retention and secure download delivery before treating evidence metadata as uploaded files.
- [ ] Current supplier evidence feature stores metadata only; it does not upload, scan or verify binary content.
- [ ] Review and test supplier invitation expiry, one-time use, recipient handling and support process.
- [ ] Load-test current list limits and plan cursor pagination before large enterprise tenants.
- [ ] Validate emission-factor sources, geography, validity windows and methodology with domain experts. No official factor dataset or external GHG assurance is bundled.

### 7. Observability and operations

- [ ] Send structured application and worker logs to a protected central log service; redact credentials, tokens, invitation URLs and personal data.
- [ ] Configure error tracking, request correlation IDs, metrics and alerts for API availability, latency, 4xx/5xx rates, database saturation, queue backlog and webhook failures.
- [ ] Configure readiness/liveness probes and verify graceful shutdown for API and worker.
- [ ] Establish on-call ownership, incident response, security contact, escalation and customer communication procedures.
- [ ] Define data retention, deletion, privacy notice, access review and audit-export handling.
- [ ] Conduct a threat model and independent penetration test before production use with sensitive customer data.

### 8. Release verification

- [ ] Review the exact release commit and confirm CI typecheck, lint, tests, migrations and build all pass.
- [ ] Smoke-test registration/login/logout, organization switching, role permissions, tenant isolation, activity approval, calculation lineage, CSV import/export, supplier portal, audit export and webhook delivery in staging.
- [ ] Verify accessibility, responsive layouts, supported browsers and keyboard-only workflows.
- [ ] Confirm dashboard and reports clearly disclose truncated datasets, planning estimates and heuristic quality findings.
- [ ] Record release tag, commit SHA, migration state, known limitations, operator and release date.

## Current known pre-deployment blockers

1. The repository currently has no committed `pnpm-lock.yaml`. A manual bootstrap workflow is now available; run it successfully before treating dependency resolution as reproducible. Until then, regular CI still uses `pnpm install --no-frozen-lockfile`.
2. API rate limits use an in-memory store. A shared store is required before horizontal API scaling.
3. Production proxy trust, CORS, secrets, TLS, database roles and backup/restore remain environment-specific operator work.
4. Supplier invitation email delivery and binary evidence storage/scanning are not implemented.
5. External security review, penetration testing, observability integrations and recovery rehearsals have not been demonstrated.

Do not mark the platform production-ready solely because CI passes. CI is a code quality gate, not a deployment, compliance certification or security assurance.
