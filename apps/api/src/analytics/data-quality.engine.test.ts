import test from "node:test";
import assert from "node:assert/strict";
import { analyzeActivityQuality, type QualityRecord } from "./data-quality.engine.js";

function record(overrides: Partial<QualityRecord> = {}): QualityRecord {
  return {
    id: "activity-1", facilityId: "facility-1", category: "DIESEL", scope: "SCOPE_1",
    quantity: "100", unit: "L", periodStart: new Date("2026-01-01T00:00:00.000Z"),
    periodEnd: new Date("2026-01-31T00:00:00.000Z"), sourceName: "Fuel invoice",
    sourceReference: "INV-100", status: "APPROVED", createdAt: new Date("2026-02-01T00:00:00.000Z"),
    submittedAt: new Date("2026-02-02T00:00:00.000Z"), hasCalculation: true, ...overrides
  };
}

test("data quality engine identifies exact duplicate candidates and missing provenance", () => {
  const result = analyzeActivityQuality([
    record({ id: "a", sourceReference: null }),
    record({ id: "b", sourceReference: null })
  ], new Date("2026-11-20T00:00:00.000Z"));
  assert.equal(result.totalRecords, 2);
  assert.equal(result.issueCounts.POSSIBLE_DUPLICATE, 2);
  assert.equal(result.issueCounts.MISSING_SOURCE_REFERENCE, 2);
  assert.equal(result.recordsWithIssues, 2);
  assert.equal(result.qualityScore, 80);
});

test("data quality engine flags stale drafts, overdue reviews and uncalculated approvals", () => {
  const result = analyzeActivityQuality([
    record({ id: "draft", status: "DRAFT", createdAt: new Date("2026-09-01T00:00:00.000Z") }),
    record({ id: "review", status: "SUBMITTED", submittedAt: new Date("2026-10-01T00:00:00.000Z") }),
    record({ id: "uncalculated", status: "APPROVED", hasCalculation: false })
  ], new Date("2026-11-20T00:00:00.000Z"));
  assert.equal(result.issueCounts.STALE_DRAFT, 1);
  assert.equal(result.issueCounts.REVIEW_OVERDUE, 1);
  assert.equal(result.issueCounts.APPROVED_NOT_CALCULATED, 1);
});

test("empty periods return a neutral score and no issues", () => {
  const result = analyzeActivityQuality([]);
  assert.equal(result.qualityScore, 100);
  assert.equal(result.totalRecords, 0);
  assert.equal(result.issueCount, 0);
});

test("statistical outliers are only flagged for sufficiently sized comparable groups", () => {
  const normal = Array.from({ length: 8 }, (_, index) => record({ id: `normal-${index}`, quantity: String(100 + index) }));
  const result = analyzeActivityQuality([...normal, record({ id: "outlier", quantity: "10000" })]);
  assert.equal(result.issueCounts.STATISTICAL_OUTLIER, 1);
  assert.equal(result.issues.find((issue) => issue.code === "STATISTICAL_OUTLIER")?.activityRecordId, "outlier");
});
