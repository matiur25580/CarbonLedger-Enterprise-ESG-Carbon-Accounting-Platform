CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING','PROCESSING','DELIVERED','FAILED');
CREATE TABLE "webhook_endpoints" (
 "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "url" VARCHAR(2048) NOT NULL,
 "event_types" TEXT[] NOT NULL, "secret_ciphertext" TEXT NOT NULL, "secret_iv" CHAR(24) NOT NULL,
 "secret_auth_tag" CHAR(32) NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
 "created_by_user_id" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "webhook_endpoints_events_check" CHECK (cardinality("event_types") BETWEEN 1 AND 20)
);
CREATE UNIQUE INDEX "webhook_endpoints_id_organization_id_key" ON "webhook_endpoints"("id","organization_id");
CREATE INDEX "webhook_endpoints_org_enabled_created_idx" ON "webhook_endpoints"("organization_id","enabled","created_at");
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_creator_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "webhook_deliveries" (
 "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "endpoint_id" UUID NOT NULL,
 "event_id" UUID NOT NULL, "event_type" VARCHAR(120) NOT NULL, "payload" JSONB NOT NULL,
 "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
 "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "locked_at" TIMESTAMP(3),
 "response_status" INTEGER, "last_error" VARCHAR(1000), "delivered_at" TIMESTAMP(3),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "webhook_deliveries_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "webhook_deliveries_id_organization_id_key" ON "webhook_deliveries"("id","organization_id");
CREATE INDEX "webhook_deliveries_status_next_created_idx" ON "webhook_deliveries"("status","next_attempt_at","created_at");
CREATE INDEX "webhook_deliveries_org_endpoint_created_idx" ON "webhook_deliveries"("organization_id","endpoint_id","created_at");
CREATE INDEX "webhook_deliveries_event_id_idx" ON "webhook_deliveries"("event_id");
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_org_fkey" FOREIGN KEY ("endpoint_id","organization_id") REFERENCES "webhook_endpoints"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_endpoints" FORCE ROW LEVEL SECURITY;
CREATE POLICY "webhook_endpoints_tenant_isolation" ON "webhook_endpoints" USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "webhook_deliveries_tenant_isolation" ON "webhook_deliveries" USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON "webhook_endpoints" TO carbonledger_app;
GRANT SELECT, INSERT, UPDATE ON "webhook_deliveries" TO carbonledger_app;
