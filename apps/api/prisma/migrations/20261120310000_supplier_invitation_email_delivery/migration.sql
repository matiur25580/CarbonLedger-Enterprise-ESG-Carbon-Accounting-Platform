CREATE TABLE supplier_invitation_emails (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 invitation_id uuid NOT NULL,
 recipient varchar(254) NOT NULL,
 payload_ciphertext text NOT NULL,
 payload_iv char(24) NOT NULL,
 payload_auth_tag char(32) NOT NULL,
 status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','SENT','FAILED')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 locked_at timestamptz,
 provider_message_id varchar(200),
 last_error varchar(1000),
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT supplier_invitation_emails_invitation_org_fkey FOREIGN KEY(invitation_id,organization_id) REFERENCES supplier_invitations(id,organization_id) ON DELETE RESTRICT,
 CONSTRAINT supplier_invitation_emails_invitation_key UNIQUE(invitation_id)
);
CREATE UNIQUE INDEX supplier_invitation_emails_id_org_key ON supplier_invitation_emails(id,organization_id);
CREATE UNIQUE INDEX supplier_invitation_emails_invitation_org_key ON supplier_invitation_emails(invitation_id,organization_id);
CREATE INDEX supplier_invitation_emails_due_idx ON supplier_invitation_emails(status,next_attempt_at,created_at);
CREATE INDEX supplier_invitation_emails_org_created_idx ON supplier_invitation_emails(organization_id,created_at);
ALTER TABLE supplier_invitation_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invitation_emails FORCE ROW LEVEL SECURITY;
CREATE POLICY supplier_invitation_emails_tenant_isolation ON supplier_invitation_emails USING(organization_id=NULLIF(current_setting('app.current_tenant_id',true),'')::uuid) WITH CHECK(organization_id=NULLIF(current_setting('app.current_tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON supplier_invitation_emails TO carbonledger_app;
