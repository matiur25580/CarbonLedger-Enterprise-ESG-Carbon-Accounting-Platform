-- Phase 6: supplier registry, questionnaire templates and single-use portal invitations.
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE','INACTIVE');
CREATE TYPE "SupplierSubmissionStatus" AS ENUM ('SUBMITTED');

CREATE TABLE "suppliers" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL, "contact_name" VARCHAR(120) NOT NULL,
  "contact_email" VARCHAR(254) NOT NULL, "country_code" CHAR(2) NOT NULL,
  "website" VARCHAR(300), "category" VARCHAR(100) NOT NULL,
  "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "suppliers_id_organization_id_key" ON "suppliers"("id","organization_id");
CREATE UNIQUE INDEX "suppliers_organization_id_contact_email_key" ON "suppliers"("organization_id","contact_email");
CREATE INDEX "suppliers_organization_id_status_name_idx" ON "suppliers"("organization_id","status","name");
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "supplier_questionnaires" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL,
  "title" VARCHAR(180) NOT NULL, "description" VARCHAR(2000),
  "version" INTEGER NOT NULL DEFAULT 1, "questions" JSONB NOT NULL,
  "is_published" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_questionnaires_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_questionnaires_version_check" CHECK ("version" > 0),
  CONSTRAINT "supplier_questionnaires_questions_array_check" CHECK (jsonb_typeof("questions") = 'array' AND jsonb_array_length("questions") > 0)
);
CREATE UNIQUE INDEX "supplier_questionnaires_id_organization_id_key" ON "supplier_questionnaires"("id","organization_id");
CREATE UNIQUE INDEX "supplier_questionnaires_org_title_version_key" ON "supplier_questionnaires"("organization_id","title","version");
CREATE INDEX "supplier_questionnaires_org_published_created_idx" ON "supplier_questionnaires"("organization_id","is_published","created_at");
ALTER TABLE "supplier_questionnaires" ADD CONSTRAINT "supplier_questionnaires_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "supplier_invitations" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL, "questionnaire_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "supplier_invitations_token_hash_key" ON "supplier_invitations"("token_hash");
CREATE UNIQUE INDEX "supplier_invitations_id_organization_id_key" ON "supplier_invitations"("id","organization_id");
CREATE INDEX "supplier_invitations_org_supplier_expires_idx" ON "supplier_invitations"("organization_id","supplier_id","expires_at");
ALTER TABLE "supplier_invitations" ADD CONSTRAINT "supplier_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_invitations" ADD CONSTRAINT "supplier_invitations_supplier_org_fkey" FOREIGN KEY ("supplier_id","organization_id") REFERENCES "suppliers"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_invitations" ADD CONSTRAINT "supplier_invitations_questionnaire_org_fkey" FOREIGN KEY ("questionnaire_id","organization_id") REFERENCES "supplier_questionnaires"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "supplier_submissions" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL, "questionnaire_id" UUID NOT NULL,
  "invitation_id" UUID NOT NULL, "status" "SupplierSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
  "answers" JSONB NOT NULL, "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_submissions_answers_object_check" CHECK (jsonb_typeof("answers") = 'object')
);
CREATE UNIQUE INDEX "supplier_submissions_id_organization_id_key" ON "supplier_submissions"("id","organization_id");
CREATE UNIQUE INDEX "supplier_submissions_invitation_id_key" ON "supplier_submissions"("invitation_id");
CREATE INDEX "supplier_submissions_org_supplier_submitted_idx" ON "supplier_submissions"("organization_id","supplier_id","submitted_at");
ALTER TABLE "supplier_submissions" ADD CONSTRAINT "supplier_submissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_submissions" ADD CONSTRAINT "supplier_submissions_supplier_org_fkey" FOREIGN KEY ("supplier_id","organization_id") REFERENCES "suppliers"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_submissions" ADD CONSTRAINT "supplier_submissions_questionnaire_org_fkey" FOREIGN KEY ("questionnaire_id","organization_id") REFERENCES "supplier_questionnaires"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_submissions" ADD CONSTRAINT "supplier_submissions_invitation_org_fkey" FOREIGN KEY ("invitation_id","organization_id") REFERENCES "supplier_invitations"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$ DECLARE tbl TEXT; BEGIN
  FOREACH tbl IN ARRAY ARRAY['suppliers','supplier_questionnaires','supplier_invitations','supplier_submissions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('CREATE POLICY %I ON %I USING (organization_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)', tbl || '_tenant_isolation', tbl);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON "suppliers","supplier_questionnaires","supplier_invitations","supplier_submissions" TO carbonledger_app;

-- Portal answers are submitted once and preserved as supplier-provided evidence.
CREATE FUNCTION reject_supplier_submission_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'supplier submissions are immutable; create a new invitation'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "supplier_submissions_immutable" BEFORE UPDATE OR DELETE ON "supplier_submissions"
FOR EACH ROW EXECUTE FUNCTION reject_supplier_submission_mutation();
