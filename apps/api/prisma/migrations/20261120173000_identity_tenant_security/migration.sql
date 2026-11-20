CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'AUDITOR');
CREATE TABLE "users" (
  "id" UUID NOT NULL, "name" VARCHAR(100) NOT NULL, "email" VARCHAR(254) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL, "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "organizations" (
  "id" UUID NOT NULL, "name" VARCHAR(160) NOT NULL, "slug" VARCHAR(80) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "organization_memberships" (
  "organization_id" UUID NOT NULL, "user_id" UUID NOT NULL,
  "role" "OrgRole" NOT NULL DEFAULT 'MEMBER', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("organization_id", "user_id")
);
CREATE TABLE "refresh_tokens" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "organization_id" UUID NOT NULL, "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL, "revoked_at" TIMESTAMP(3), "replaced_by_token_hash" CHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "actor_user_id" UUID,
  "action" VARCHAR(120) NOT NULL, "resource_type" VARCHAR(80) NOT NULL,
  "resource_id" VARCHAR(120) NOT NULL, "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "organization_memberships_user_id_created_at_idx" ON "organization_memberships"("user_id", "created_at");
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens"("user_id", "expires_at");
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");
CREATE INDEX "audit_logs_organization_id_resource_type_resource_id_idx" ON "audit_logs"("organization_id", "resource_type", "resource_id");
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "organizations_tenant_isolation" ON "organizations"
  USING (
    "id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM "organization_memberships" membership
      WHERE membership.organization_id = "organizations"."id"
        AND membership.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  WITH CHECK ("id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
ALTER TABLE "organization_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY "memberships_tenant_or_self" ON "organization_memberships"
  USING (
    "organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  )
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_tenant_isolation" ON "audit_logs"
  USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Audit events are append-only for the application runtime role.
REVOKE UPDATE, DELETE ON TABLE "audit_logs" FROM carbonledger_app;
