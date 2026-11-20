export interface QualityRecord {
  id: string;
  facilityId: string;
  category: string;
  scope: string;
  quantity: string;
  unit: string;
  periodStart: Date;
  periodEnd: Date;
  sourceName: string;
  sourceReference: string | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  createdAt: Date;
  submittedAt: Date | null;
  hasCalculation: boolean;
}

export type QualityIssueCode =
  | "POSSIBLE_DUPLICATE"
  | "MISSING_SOURCE_REFERENCE"
  | "STALE_DRAFT"
  | "REVIEW_OVERDUE"
  | "APPROVED_NOT_CALCULATED"
  | "STATISTICAL_OUTLIER";

export interface QualityIssue {
  code: QualityIssueCode;
  severity: "LOW" | "MEDIUM" | "HIGH";
  message: string;
  activityRecordId: string;
}

const penalties: Record<QualityIssueCode, number> = {
  POSSIBLE_DUPLICATE: 15,
  MISSING_SOURCE_REFERENCE: 5,
  STALE_DRAFT: 5,
  REVIEW_OVERDUE: 5,
  APPROVED_NOT_CALCULATED: 8,
  STATISTICAL_OUTLIER: 10
};

function percentile(sorted: number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

export function analyzeActivityQuality(records: QualityRecord[], now = new Date()) {
  const issues: QualityIssue[] = [];
  const byRecord = new Map<string, QualityIssueCode[]>();
  const add = (record: QualityRecord, code: QualityIssueCode, severity: QualityIssue["severity"], message: string) => {
    issues.push({ code, severity, message, activityRecordId: record.id });
    const current = byRecord.get(record.id) ?? [];
    current.push(code);
    byRecord.set(record.id, current);
  };

  const duplicateGroups = new Map<string, QualityRecord[]>();
  for (const record of records) {
    const key = JSON.stringify([
      record.facilityId, record.category, record.scope, record.quantity, record.unit,
      record.periodStart.toISOString().slice(0, 10), record.periodEnd.toISOString().slice(0, 10),
      record.sourceName.trim().toLowerCase(), record.sourceReference?.trim().toLowerCase() ?? null
    ]);
    const group = duplicateGroups.get(key) ?? [];
    group.push(record);
    duplicateGroups.set(key, group);
  }
  for (const group of duplicateGroups.values()) {
    if (group.length > 1) {
      for (const record of group) add(record, "POSSIBLE_DUPLICATE", "HIGH", "An identical activity-data fingerprint appears more than once; verify before deleting or changing records.");
    }
  }

  const cutoffDraft = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const cutoffReview = now.getTime() - 14 * 24 * 60 * 60 * 1000;
  for (const record of records) {
    if (!record.sourceReference?.trim()) add(record, "MISSING_SOURCE_REFERENCE", "LOW", "No source document or reference is recorded.");
    if (record.status === "DRAFT" && record.createdAt.getTime() <= cutoffDraft) {
      add(record, "STALE_DRAFT", "MEDIUM", "Draft has remained unsubmitted for at least 30 days.");
    }
    if (record.status === "SUBMITTED" && record.submittedAt && record.submittedAt.getTime() <= cutoffReview) {
      add(record, "REVIEW_OVERDUE", "MEDIUM", "Submission has been awaiting review for at least 14 days.");
    }
    if (record.status === "APPROVED" && !record.hasCalculation) {
      add(record, "APPROVED_NOT_CALCULATED", "MEDIUM", "Approved activity has no linked calculation result.");
    }
  }

  const groups = new Map<string, QualityRecord[]>();
  for (const record of records) {
    const key = `${record.category}|${record.unit.trim().toLowerCase()}`;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 8) continue;
    const values = group.map((record) => Number(record.quantity)).filter(Number.isFinite).sort((a, b) => a - b);
    if (values.length < 8) continue;
    const q1 = percentile(values, 0.25);
    const q3 = percentile(values, 0.75);
    const spread = q3 - q1;
    if (spread <= 0) continue;
    const lower = q1 - 3 * spread;
    const upper = q3 + 3 * spread;
    for (const record of group) {
      const value = Number(record.quantity);
      if (value < lower || value > upper) {
        add(record, "STATISTICAL_OUTLIER", "MEDIUM", "Quantity is a statistical outlier within its category and unit group; investigate context before treating it as an error.");
      }
    }
  }

  const scores = records.map((record) =>
    Math.max(0, 100 - (byRecord.get(record.id) ?? []).reduce((sum, code) => sum + penalties[code], 0))
  );
  const issueCounts = Object.fromEntries(
    (Object.keys(penalties) as QualityIssueCode[]).map((code) => [code, issues.filter((issue) => issue.code === code).length])
  ) as Record<QualityIssueCode, number>;

  return {
    qualityScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 100,
    totalRecords: records.length,
    recordsWithIssues: byRecord.size,
    issueCount: issues.length,
    issueCounts,
    issues: issues.sort((a, b) => {
      const severity = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return severity[a.severity] - severity[b.severity] || a.activityRecordId.localeCompare(b.activityRecordId);
    })
  };
}
