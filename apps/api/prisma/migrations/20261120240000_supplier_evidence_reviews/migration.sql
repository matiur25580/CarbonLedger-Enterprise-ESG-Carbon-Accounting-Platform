-- Phase 7: tenant-scoped evidence metadata and append-only review decisions.
CREATE TYPE "SupplierReviewDecision" AS ENUM ('APPROVED','REJECTED','NEEDS_CHANGES');

CREATE TABLE "supplier_evidence" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "submission_id" UUID NOT NULL,
  "uploaded_by_user_id" UUID NOT NULL,
  "file_name" VARCHAR(240) NOT NULL,
  "media_type" VARCHAR(120) NOT NULL,
  "byte_size" BIGINT NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "storage_provider" VARCHAR(40) NOT NULL,
  "object_key" VARCHAR(500) NOT NULL,
  "description" VARCHAR(1000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_evidence_size_check" CHECK ("byte_size" > 0 AND "byte_size" <= 52428800),
  CONSTRAINT "supplier_evidence_sha256_check" CHECK ("sha256" ~ '^[a-fA-F0-9]{64}$')
);
CREATE UNIQUE INDEX "supplier_evidence_id_organization_id_key" ON "supplier_evidence"("id","organization_id");
CREATE UNIQUE INDEX "supplier_evidence_org_storage_key" ON "supplier_evidence"("organization_id","storage_provider","object_key");
CREATE INDEX "supplier_evidence_org_submission_created_idx" ON "supplier_evidence"("organization_id","submission_id","created_at");
ALTER TABLE "supplier_evidence" ADD CONSTRAINT "supplier_evidence_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_evidence" ADD CONSTRAINT "supplier_evidence_submission_org_fkey" FOREIGN KEY ("submission_id","organization_id") REFERENCES "supplier_submissions"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_evidence" ADD CONSTRAINT "supplier_evidence_uploader_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "supplier_submission_reviews" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "submission_id" UUID NOT NULL,
  "reviewer_user_id" UUID NOT NULL,
  "decision" "SupplierReviewDecision" NOT NULL,
  "comment" VARCHAR(2000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_submission_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "supplier_submission_reviews_id_organization_id_key" ON "supplier_submission_reviews"("id","organization_id");
CREATE INDEX "supplier_submission_reviews_org_submission_created_idx" ON "supplier_submission_reviews"("organization_id","submission_id","created_at");
ALTER TABLE "supplier_submission_reviews" ADD CONSTRAINT "supplier_submission_reviews_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_submission_reviews" ADD CONSTRAINT "supplier_submission_reviews_submission_org_fkey" FOREIGN KEY ("submission_id","organization_id") REFERENCES "supplier_submissions"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_submission_reviews" ADD CONSTRAINT "supplier_submission_reviews_reviewer_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_evidence" FORCE ROW LEVEL SECURITY;
CREATE POLICY "supplier_evidence_tenant_isolation" ON "supplier_evidence"
  USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
ALTER TABLE "supplier_submission_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_submission_reviews" FORCE ROW LEVEL SECURITY;
CREATE POLICY "supplier_submission_reviews_tenant_isolation" ON "supplier_submission_reviews"
  USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON "supplier_evidence","supplier_submission_reviews" TO carbonledger_app;

-- Evidence metadata and review decisions are append-only audit records.
CREATE FUNCTION reject_supplier_phase7_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'supplier evidence and review history are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "supplier_evidence_immutable" BEFORE UPDATE OR DELETE ON "supplier_evidence"
FOR EACH ROW EXECUTE FUNCTION reject_supplier_phase7_mutation();
CREATE TRIGGER "supplier_submission_reviews_immutable" BEFORE UPDATE OR DELETE ON "supplier_submission_reviews"
FOR EACH ROW EXECUTE FUNCTION reject_supplier_phase7_mutation();
