import { z } from "zod";

export const supplierReviewHealthQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL")
}).strict();

export type SupplierEngagementState =
  | "NO_SUBMISSION"
  | "AWAITING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_CHANGES";

export type EvidenceReviewDecision = "APPROVED" | "REJECTED" | "NEEDS_CHANGES";

export function getSupplierEngagementState(
  hasSubmission: boolean,
  reviewDecision: string | null
): SupplierEngagementState {
  if (!hasSubmission) return "NO_SUBMISSION";
  if (reviewDecision === "APPROVED") return "APPROVED";
  if (reviewDecision === "REJECTED") return "REJECTED";
  if (reviewDecision === "NEEDS_CHANGES") return "NEEDS_CHANGES";
  return "AWAITING_REVIEW";
}

export function countEvidenceReviewDecisions(
  decisions: readonly (string | null | undefined)[]
) {
  const counts = { APPROVED: 0, REJECTED: 0, NEEDS_CHANGES: 0, PENDING: 0 };
  for (const decision of decisions) {
    if (decision === "APPROVED" || decision === "REJECTED" || decision === "NEEDS_CHANGES") {
      counts[decision]++;
    } else {
      counts.PENDING++;
    }
  }
  return counts;
}
