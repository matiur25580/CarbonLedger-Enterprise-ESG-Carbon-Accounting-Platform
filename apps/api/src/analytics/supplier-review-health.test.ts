import assert from "node:assert/strict";
import test from "node:test";
import {
  countEvidenceReviewDecisions,
  getSupplierEngagementState,
  supplierReviewHealthQuerySchema
} from "./supplier-review-health.js";

test("supplier health filters apply safe defaults", () => {
  assert.deepEqual(supplierReviewHealthQuerySchema.parse({}), {
    limit: 25,
    status: "ALL"
  });
});

test("supplier health filters coerce bounded page sizes and trim search text", () => {
  assert.deepEqual(supplierReviewHealthQuerySchema.parse({
    limit: "100",
    q: "  Acme  ",
    status: "ACTIVE"
  }), { limit: 100, q: "Acme", status: "ACTIVE" });
});

test("supplier health filters reject zero, oversized and fractional page sizes", () => {
  for (const limit of ["0", "101", "1.5"]) {
    assert.equal(supplierReviewHealthQuerySchema.safeParse({ limit }).success, false);
  }
});

test("supplier health filters reject malformed cursors and unsupported statuses", () => {
  assert.equal(supplierReviewHealthQuerySchema.safeParse({ cursor: "not-a-uuid" }).success, false);
  assert.equal(supplierReviewHealthQuerySchema.safeParse({ status: "PENDING" }).success, false);
});

test("supplier health filters reject unknown query parameters", () => {
  assert.equal(supplierReviewHealthQuerySchema.safeParse({ debug: "true" }).success, false);
});

test("supplier workflow state distinguishes missing submissions and all review outcomes", () => {
  assert.equal(getSupplierEngagementState(false, null), "NO_SUBMISSION");
  assert.equal(getSupplierEngagementState(true, null), "AWAITING_REVIEW");
  assert.equal(getSupplierEngagementState(true, "APPROVED"), "APPROVED");
  assert.equal(getSupplierEngagementState(true, "REJECTED"), "REJECTED");
  assert.equal(getSupplierEngagementState(true, "NEEDS_CHANGES"), "NEEDS_CHANGES");
  assert.equal(getSupplierEngagementState(true, "UNEXPECTED"), "AWAITING_REVIEW");
});

test("evidence review counts classify every known decision and pending item", () => {
  assert.deepEqual(countEvidenceReviewDecisions([
    "APPROVED", "APPROVED", "REJECTED", "NEEDS_CHANGES", null, undefined, "UNKNOWN"
  ]), { APPROVED: 2, REJECTED: 1, NEEDS_CHANGES: 1, PENDING: 3 });
});

test("empty evidence review sets return zero counts", () => {
  assert.deepEqual(countEvidenceReviewDecisions([]), {
    APPROVED: 0, REJECTED: 0, NEEDS_CHANGES: 0, PENDING: 0
  });
});
