-- Phase 4: immutable, tenant-scoped calculation runs and result snapshots.
CREATE TABLE "calculation_runs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "engine_version" VARCHAR(40) NOT NULL,
  "requested_count" INTEGER NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calculation_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calculation_runs_count_check" CHECK ("requested_count" > 0)
);
CREATE UNIQUE INDEX "calculation_runs_id_organization_id_key" ON "calculation_runs"("id","organization_id");
CREATE UNIQUE INDEX "calculation_runs_organization_id_fingerprint_key" ON "calculation_runs"("organization_id","fingerprint");
CREATE INDEX "calculation_runs_organization_id_created_at_idx" ON "calculation_runs"("organization_id","created_at");
ALTER TABLE "calculation_runs" ADD CONSTRAINT "calculation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_runs" ADD CONSTRAINT "calculation_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "activity_records_id_organization_id_key" ON "activity_records"("id","organization_id");

CREATE TABLE "calculation_results" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "calculation_run_id" UUID NOT NULL,
  "activity_record_id" UUID NOT NULL,
  "emission_factor_id" UUID NOT NULL,
  "activity_quantity" DECIMAL(20,6) NOT NULL,
  "activity_unit" VARCHAR(40) NOT NULL,
  "normalized_quantity" DECIMAL(30,12) NOT NULL,
  "factor_unit" VARCHAR(40) NOT NULL,
  "conversion_multiplier" DECIMAL(30,18) NOT NULL,
  "conversion_path" JSONB NOT NULL,
  "factor_value" DECIMAL(24,12) NOT NULL,
  "kg_co2e" DECIMAL(38,18) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calculation_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calculation_results_nonnegative_check" CHECK ("activity_quantity" > 0 AND "normalized_quantity" >= 0 AND "factor_value" >= 0 AND "kg_co2e" >= 0)
);
CREATE UNIQUE INDEX "calculation_results_run_activity_key" ON "calculation_results"("calculation_run_id","activity_record_id");
CREATE INDEX "calculation_results_org_activity_created_idx" ON "calculation_results"("organization_id","activity_record_id","created_at");
ALTER TABLE "calculation_results" ADD CONSTRAINT "calculation_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_results" ADD CONSTRAINT "calculation_results_run_org_fkey" FOREIGN KEY ("calculation_run_id","organization_id") REFERENCES "calculation_runs"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_results" ADD CONSTRAINT "calculation_results_activity_org_fkey" FOREIGN KEY ("activity_record_id","organization_id") REFERENCES "activity_records"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_results" ADD CONSTRAINT "calculation_results_factor_org_fkey" FOREIGN KEY ("emission_factor_id","organization_id") REFERENCES "emission_factors"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "calculation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calculation_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "calculation_runs_tenant_isolation" ON "calculation_runs"
  USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
ALTER TABLE "calculation_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calculation_results" FORCE ROW LEVEL SECURITY;
CREATE POLICY "calculation_results_tenant_isolation" ON "calculation_results"
  USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "calculation_runs","calculation_results" TO carbonledger_app;

-- Historical calculation evidence is append-only, including at the database layer.
CREATE FUNCTION reject_calculation_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'calculation history is immutable; create a new calculation run';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "calculation_runs_immutable" BEFORE UPDATE OR DELETE ON "calculation_runs"
  FOR EACH ROW EXECUTE FUNCTION reject_calculation_mutation();
CREATE TRIGGER "calculation_results_immutable" BEFORE UPDATE OR DELETE ON "calculation_results"
  FOR EACH ROW EXECUTE FUNCTION reject_calculation_mutation();
