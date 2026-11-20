# Identity, authorization and tenant isolation

## Identity model
- A global user account is identified by a normalized, unique email address.
- A user may belong to multiple organizations through an explicit membership.
- Membership roles are OWNER, ADMIN, MEMBER and AUDITOR. The API never accepts OWNER as a self-service role assignment.
- Registration creates the user, organization, owner membership and initial audit event in one database transaction.

## Session lifecycle
- Passwords are hashed with bcrypt (work factor 12); plaintext passwords are never stored or logged.
- Access tokens are HS256 JWTs with a 15-minute lifetime, issuer, audience and unique token ID.
- Refresh tokens are cryptographically random opaque values. Only SHA-256 hashes are persisted.
- Refresh rotation uses a conditional database update so concurrent reuse of one token cannot create multiple active descendants.
- Refresh tokens are delivered only in an HttpOnly, SameSite=Strict cookie scoped to /api/v1/auth. Production must set COOKIE_SECURE=true and serve over HTTPS.
- Logout revokes the presented refresh token. Access tokens expire naturally; immediate access-token revocation is not part of this phase.

## Tenant isolation
- The organization selected by a signed access token is checked against a current membership record on every authenticated request.
- Tenant-owned organization and membership operations use transaction-local PostgreSQL settings; settings are cleared automatically when the transaction ends.
- RLS policies are enabled and forced on organizations, organization_memberships and audit_logs.
- Membership discovery is constrained to the current user context. Tenant membership operations are constrained to the selected tenant.
- All protected resource queries must include the tenant ID even when RLS is enabled. RLS is defense in depth, not a substitute for authorization.
- Never use session-level SET on pooled connections. Use transaction-local set_config(..., true) only.

## Production database roles
The application runtime role (`carbonledger_app`) is provisioned as a dedicated non-superuser role without BYPASSRLS and does not own tenant tables. Prisma migration commands use the separate administrator/migration connection (`DATABASE_URL`); the API uses `APP_DATABASE_URL`. Production must replace both local development credentials with separately managed roles and secrets. PostgreSQL superusers always bypass RLS, so do not run the application as a superuser. The local Docker Compose account is a development convenience and is not a production credential.

## Operational controls still required before production
- Registration, login and refresh have per-process rate limits; production multi-instance deployments must use a shared rate-limit store and centralized abuse monitoring.
- Email verification, password reset, MFA and session/device management.
- CSRF review for cookie-authenticated refresh/logout flows when deployment origins or cookie policy change.
- Secret rotation and a managed secret store for JWT_ACCESS_SECRET.
- Automated integration tests against a real PostgreSQL instance, including cross-tenant RLS assertions using the non-owner runtime role.
