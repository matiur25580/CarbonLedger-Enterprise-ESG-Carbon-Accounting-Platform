-- Phase 7 extension: independent evidence-level approval history.
CREATE TABLE "supplier_evidence_reviews" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "evidence_id" UUID NOT NULL,
  "submission_id" UUID NOT NULL,
  "reviewer_user_id" UUID NOT NULL,
  "decision" "SupplierReviewDecision" NOT NULL,
  "comment" VARCHAR(2000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_evidence_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "supplier_evidence_reviews_id_organization_id_key" ON "supplier_evidence_reviews"("id","organization_id");
CREATE INDEX "supplier_evidence_reviews_org_evidence_created_idx" ON "supplier_evidence_reviews"("organization_id","evidence_id","created_at");
CREATE INDEX "supplier_evidence_reviews_org_submission_created_idx" ON "supplier_evidence_reviews"("organization_id","submission_id","created_at");
ALTER TABLE "supplier_evidence_reviews" ADD CONSTRAINT "supplier_evidence_reviews_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_evidence_reviews" ADD CONSTRAINT "supplier_evidence_reviews_evidence_org_fkey" FOREIGN KEY ("evidence_id","organization_id") REFERENCES "supplier_evidence"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_evidence_reviews" ADD CONSTRAINT "supplier_evidence_reviews_reviewer_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_evidence_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_evidence_reviews" FORCE ROW LEVEL SECURITY;
CREATE POLICY "supplier_evidence_reviews_tenant_isolation" ON "supplier_evidence_reviews"
  USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON "supplier_evidence_reviews" TO carbonledger_app;
CREATE TRIGGER "supplier_evidence_reviews_immutable" BEFORE UPDATE OR DELETE ON "supplier_evidence_reviews"
FOR EACH ROW EXECUTE FUNCTION reject_supplier_phase7_mutation();
