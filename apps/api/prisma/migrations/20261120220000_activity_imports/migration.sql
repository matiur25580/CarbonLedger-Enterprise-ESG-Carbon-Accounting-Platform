-- Phase 5: tenant-scoped, auditable CSV activity imports.
CREATE TYPE "ActivityImportStatus" AS ENUM ('COMMITTED');

CREATE TABLE "activity_import_batches" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "file_name" VARCHAR(180) NOT NULL,
  "content_sha256" CHAR(64) NOT NULL,
  "status" "ActivityImportStatus" NOT NULL DEFAULT 'COMMITTED',
  "total_rows" INTEGER NOT NULL,
  "imported_rows" INTEGER NOT NULL,
  "report" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_import_batches_counts_check" CHECK ("total_rows" > 0 AND "imported_rows" > 0 AND "imported_rows" <= "total_rows")
);
CREATE UNIQUE INDEX "activity_import_batches_id_organization_id_key" ON "activity_import_batches"("id","organization_id");
CREATE UNIQUE INDEX "activity_import_batches_organization_id_content_sha256_key" ON "activity_import_batches"("organization_id","content_sha256");
CREATE INDEX "activity_import_batches_organization_id_created_at_idx" ON "activity_import_batches"("organization_id","created_at");
ALTER TABLE "activity_import_batches" ADD CONSTRAINT "activity_import_batches_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_import_batches" ADD CONSTRAINT "activity_import_batches_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activity_records" ADD COLUMN "import_batch_id" UUID;
CREATE INDEX "activity_records_organization_id_import_batch_id_idx" ON "activity_records"("organization_id","import_batch_id");
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_import_batch_org_fkey"
  FOREIGN KEY ("import_batch_id","organization_id") REFERENCES "activity_import_batches"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activity_import_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_import_batches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "activity_import_batches_tenant_isolation" ON "activity_import_batches"
  USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "activity_import_batches" TO carbonledger_app;
