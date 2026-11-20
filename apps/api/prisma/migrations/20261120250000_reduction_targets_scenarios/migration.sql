CREATE TYPE "InitiativeStatus" AS ENUM ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED');

CREATE TABLE "reduction_targets" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "scope" "EmissionScope" NOT NULL,
  "baseline_year" INTEGER NOT NULL,
  "target_year" INTEGER NOT NULL,
  "baseline_kg_co2e" DECIMAL(38,18) NOT NULL,
  "reduction_percent" DECIMAL(7,4) NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reduction_targets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reduction_targets_year_check" CHECK ("baseline_year" >= 1900 AND "target_year" > "baseline_year"),
  CONSTRAINT "reduction_targets_baseline_check" CHECK ("baseline_kg_co2e" > 0),
  CONSTRAINT "reduction_targets_percent_check" CHECK ("reduction_percent" > 0 AND "reduction_percent" <= 100)
);
CREATE UNIQUE INDEX "reduction_targets_id_organization_id_key" ON "reduction_targets"("id","organization_id");
CREATE INDEX "reduction_targets_org_target_year_idx" ON "reduction_targets"("organization_id","target_year");
ALTER TABLE "reduction_targets" ADD CONSTRAINT "reduction_targets_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reduction_targets" ADD CONSTRAINT "reduction_targets_creator_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "reduction_initiatives" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "target_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "description" VARCHAR(2000),
  "status" "InitiativeStatus" NOT NULL DEFAULT 'PLANNED',
  "expected_annual_reduction_kg" DECIMAL(38,18) NOT NULL,
  "start_date" DATE,
  "end_date" DATE,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reduction_initiatives_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reduction_initiatives_reduction_check" CHECK ("expected_annual_reduction_kg" > 0),
  CONSTRAINT "reduction_initiatives_dates_check" CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "end_date" >= "start_date")
);
CREATE UNIQUE INDEX "reduction_initiatives_id_organization_id_key" ON "reduction_initiatives"("id","organization_id");
CREATE INDEX "reduction_initiatives_org_target_status_idx" ON "reduction_initiatives"("organization_id","target_id","status");
ALTER TABLE "reduction_initiatives" ADD CONSTRAINT "reduction_initiatives_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reduction_initiatives" ADD CONSTRAINT "reduction_initiatives_target_org_fkey" FOREIGN KEY ("target_id","organization_id") REFERENCES "reduction_targets"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reduction_initiatives" ADD CONSTRAINT "reduction_initiatives_creator_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "reduction_scenarios" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "target_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "baseline_kg_co2e" DECIMAL(38,18) NOT NULL,
  "planned_reduction_kg" DECIMAL(38,18) NOT NULL,
  "projected_kg_co2e" DECIMAL(38,18) NOT NULL,
  "target_kg_co2e" DECIMAL(38,18) NOT NULL,
  "assumptions" JSONB NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reduction_scenarios_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reduction_scenarios_values_check" CHECK ("baseline_kg_co2e" > 0 AND "planned_reduction_kg" >= 0 AND "projected_kg_co2e" >= 0 AND "target_kg_co2e" >= 0)
);
CREATE UNIQUE INDEX "reduction_scenarios_id_organization_id_key" ON "reduction_scenarios"("id","organization_id");
CREATE INDEX "reduction_scenarios_org_target_created_idx" ON "reduction_scenarios"("organization_id","target_id","created_at");
ALTER TABLE "reduction_scenarios" ADD CONSTRAINT "reduction_scenarios_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reduction_scenarios" ADD CONSTRAINT "reduction_scenarios_target_org_fkey" FOREIGN KEY ("target_id","organization_id") REFERENCES "reduction_targets"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reduction_scenarios" ADD CONSTRAINT "reduction_scenarios_creator_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE t TEXT;
BEGIN
 FOREACH t IN ARRAY ARRAY['reduction_targets','reduction_initiatives','reduction_scenarios'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON %I USING (organization_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)', t || '_tenant_isolation',t);
 END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON "reduction_targets","reduction_initiatives" TO carbonledger_app;
GRANT SELECT, INSERT ON "reduction_scenarios" TO carbonledger_app;

CREATE FUNCTION reject_reduction_scenario_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'reduction scenario snapshots are immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "reduction_scenarios_immutable" BEFORE UPDATE OR DELETE ON "reduction_scenarios"
FOR EACH ROW EXECUTE FUNCTION reject_reduction_scenario_mutation();
