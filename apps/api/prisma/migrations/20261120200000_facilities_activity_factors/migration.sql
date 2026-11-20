CREATE TYPE "ActivityCategory" AS ENUM (
  'ELECTRICITY','NATURAL_GAS','DIESEL','PETROL','LPG','REFRIGERANTS',
  'COMPANY_VEHICLES','BUSINESS_TRAVEL','WASTE','WATER','PURCHASED_GOODS','FREIGHT','OTHER'
);
CREATE TYPE "EmissionScope" AS ENUM ('SCOPE_1','SCOPE_2','SCOPE_3');
CREATE TYPE "ActivityStatus" AS ENUM ('DRAFT','SUBMITTED','APPROVED','REJECTED');
CREATE TYPE "EmissionFactorStatus" AS ENUM ('DRAFT','PUBLISHED','RETIRED');

CREATE TABLE "facilities" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "country_code" CHAR(2) NOT NULL,
  "region" VARCHAR(120),
  "city" VARCHAR(120),
  "address_line_1" VARCHAR(200),
  "timezone" VARCHAR(80) NOT NULL DEFAULT 'UTC',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "facilities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "facilities_country_code_check" CHECK ("country_code" ~ '^[A-Z]{2}$')
);
CREATE UNIQUE INDEX "facilities_organization_id_code_key" ON "facilities"("organization_id","code");
CREATE UNIQUE INDEX "facilities_id_organization_id_key" ON "facilities"("id","organization_id");
CREATE INDEX "facilities_organization_id_is_active_name_idx" ON "facilities"("organization_id","is_active","name");
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "activity_records" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "facility_id" UUID NOT NULL,
  "category" "ActivityCategory" NOT NULL,
  "scope" "EmissionScope" NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "unit" VARCHAR(40) NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "source_name" VARCHAR(160) NOT NULL,
  "source_reference" VARCHAR(240),
  "notes" VARCHAR(2000),
  "status" "ActivityStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_user_id" UUID NOT NULL,
  "reviewed_by_user_id" UUID,
  "submitted_at" TIMESTAMP(3),
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "activity_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_records_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "activity_records_period_check" CHECK ("period_end" >= "period_start"),
  CONSTRAINT "activity_records_review_state_check" CHECK (
    ("status" IN ('APPROVED','REJECTED') AND "reviewed_at" IS NOT NULL AND "reviewed_by_user_id" IS NOT NULL)
    OR ("status" NOT IN ('APPROVED','REJECTED') AND "reviewed_at" IS NULL AND "reviewed_by_user_id" IS NULL)
  )
);
CREATE INDEX "activity_records_organization_id_period_start_period_end_idx" ON "activity_records"("organization_id","period_start","period_end");
CREATE INDEX "activity_records_organization_id_facility_id_category_status_idx" ON "activity_records"("organization_id","facility_id","category","status");
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_facility_id_organization_id_fkey" FOREIGN KEY ("facility_id","organization_id") REFERENCES "facilities"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "emission_factors" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "name" VARCHAR(180) NOT NULL,
  "category" "ActivityCategory" NOT NULL,
  "scope" "EmissionScope" NOT NULL,
  "unit" VARCHAR(40) NOT NULL,
  "geography_code" VARCHAR(12) NOT NULL,
  "kg_co2e_per_unit" DECIMAL(24,12) NOT NULL,
  "source_name" VARCHAR(180) NOT NULL,
  "source_url" VARCHAR(500),
  "source_version" VARCHAR(80) NOT NULL,
  "methodology" VARCHAR(2000) NOT NULL,
  "uncertainty_percent" DECIMAL(7,4),
  "valid_from" DATE NOT NULL,
  "valid_to" DATE,
  "status" "EmissionFactorStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_user_id" UUID NOT NULL,
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "emission_factors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "emission_factors_version_check" CHECK ("version" > 0),
  CONSTRAINT "emission_factors_factor_value_check" CHECK ("kg_co2e_per_unit" >= 0),
  CONSTRAINT "emission_factors_validity_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
  CONSTRAINT "emission_factors_uncertainty_check" CHECK ("uncertainty_percent" IS NULL OR ("uncertainty_percent" >= 0 AND "uncertainty_percent" <= 100)),
  CONSTRAINT "emission_factors_publish_state_check" CHECK (
    ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL)
    OR ("status" <> 'PUBLISHED' AND "published_at" IS NULL)
  )
);
CREATE UNIQUE INDEX "emission_factors_organization_id_code_version_key" ON "emission_factors"("organization_id","code","version");
CREATE UNIQUE INDEX "emission_factors_id_organization_id_key" ON "emission_factors"("id","organization_id");
CREATE INDEX "emission_factors_organization_id_category_geography_code_status_idx" ON "emission_factors"("organization_id","category","geography_code","status");
CREATE INDEX "emission_factors_organization_id_valid_from_valid_to_idx" ON "emission_factors"("organization_id","valid_from","valid_to");
ALTER TABLE "emission_factors" ADD CONSTRAINT "emission_factors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emission_factors" ADD CONSTRAINT "emission_factors_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "facilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "facilities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "facilities_tenant_isolation" ON "facilities"
  USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "activity_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY "activity_records_tenant_isolation" ON "activity_records"
  USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "emission_factors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emission_factors" FORCE ROW LEVEL SECURITY;
CREATE POLICY "emission_factors_tenant_isolation" ON "emission_factors"
  USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "facilities","activity_records","emission_factors" TO carbonledger_app;
