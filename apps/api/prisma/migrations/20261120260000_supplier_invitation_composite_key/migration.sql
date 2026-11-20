-- Prisma requires the composite referenced key used by the tenant-aware
-- one-to-one SupplierSubmission -> SupplierInvitation relation.
-- invitation_id is already globally unique; this adds the explicit composite key.
ALTER TABLE supplier_submissions
  ADD CONSTRAINT supplier_submissions_invitation_id_organization_id_key
  UNIQUE (invitation_id, organization_id);
