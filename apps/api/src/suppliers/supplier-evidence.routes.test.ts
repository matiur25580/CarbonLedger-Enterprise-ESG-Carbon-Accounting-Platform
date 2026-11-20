import assert from "node:assert/strict";
import test from "node:test";
import { evidenceReviewEligibility } from "./supplier-evidence.routes.js";

test("evidence uploader cannot approve or reject their own file",()=>{
  assert.equal(evidenceReviewEligibility({uploadedByUserId:"user-a",reviewerUserId:"user-a",storageProvider:"s3",malwareScanVerified:true}),"SELF_REVIEW");
});
test("S3 evidence cannot enter approval before a clean scan is recorded",()=>{
  assert.equal(evidenceReviewEligibility({uploadedByUserId:"user-a",reviewerUserId:"user-b",storageProvider:"s3",malwareScanVerified:false}),"NOT_SCANNED");
});
test("clean-scanned evidence can be reviewed by another authorized reviewer",()=>{
  assert.equal(evidenceReviewEligibility({uploadedByUserId:"user-a",reviewerUserId:"user-b",storageProvider:"s3",malwareScanVerified:true}),"ELIGIBLE");
});
test("non-S3 legacy evidence keeps its existing metadata review path",()=>{
  assert.equal(evidenceReviewEligibility({uploadedByUserId:"user-a",reviewerUserId:"user-b",storageProvider:"legacy",malwareScanVerified:false}),"ELIGIBLE");
});
