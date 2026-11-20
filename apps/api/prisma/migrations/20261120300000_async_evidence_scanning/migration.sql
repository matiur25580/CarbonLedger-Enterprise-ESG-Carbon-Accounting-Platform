CREATE TABLE evidence_scan_jobs (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 submission_id uuid NOT NULL, uploaded_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 file_name varchar(240) NOT NULL, media_type varchar(120) NOT NULL,
 byte_size bigint NOT NULL CHECK(byte_size>0 AND byte_size<=52428800), object_key varchar(500) NOT NULL,
 description varchar(1000), status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','CLEAN','FAILED')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), next_attempt_at timestamptz NOT NULL DEFAULT now(),
 locked_at timestamptz, last_error varchar(1000), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT evidence_scan_jobs_submission_org_fkey FOREIGN KEY(submission_id,organization_id) REFERENCES supplier_submissions(id,organization_id) ON DELETE RESTRICT,
 CONSTRAINT evidence_scan_jobs_org_object_key_key UNIQUE(organization_id,object_key)
);
CREATE UNIQUE INDEX evidence_scan_jobs_id_org_key ON evidence_scan_jobs(id,organization_id);
CREATE INDEX evidence_scan_jobs_due_idx ON evidence_scan_jobs(status,next_attempt_at,created_at);
CREATE INDEX evidence_scan_jobs_org_submission_idx ON evidence_scan_jobs(organization_id,submission_id,created_at);
ALTER TABLE evidence_scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_scan_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_scan_jobs_tenant_isolation ON evidence_scan_jobs USING(organization_id=NULLIF(current_setting('app.current_tenant_id',true),'')::uuid) WITH CHECK(organization_id=NULLIF(current_setting('app.current_tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON evidence_scan_jobs TO carbonledger_app;
