-- Import batch records are evidence and must remain append-only.
CREATE FUNCTION reject_activity_import_batch_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity import history is immutable; create a new import batch';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "activity_import_batches_immutable"
  BEFORE UPDATE OR DELETE ON "activity_import_batches"
  FOR EACH ROW EXECUTE FUNCTION reject_activity_import_batch_mutation();
