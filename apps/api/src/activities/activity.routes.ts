import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { AuthRequest, requireRole } from "../auth/auth.middleware.js";
import { withTenantContext } from "../auth/tenant-context.js";

export const activityRouter = Router();

const categories = ["ELECTRICITY","NATURAL_GAS","DIESEL","PETROL","LPG","REFRIGERANTS","COMPANY_VEHICLES","BUSINESS_TRAVEL","WASTE","WATER","PURCHASED_GOODS","FREIGHT","OTHER"] as const;
const scopes = ["SCOPE_1","SCOPE_2","SCOPE_3"] as const;
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");
const createActivitySchema = z.object({
  facilityId: z.string().uuid(),
  category: z.enum(categories),
  scope: z.enum(scopes),
  quantity: z.number().finite().positive().max(1_000_000_000_000),
  unit: z.string().trim().min(1).max(40),
  periodStart: dateString,
  periodEnd: dateString,
  sourceName: z.string().trim().min(2).max(160),
  sourceReference: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(2000).optional()
}).refine((value) => value.periodEnd >= value.periodStart, { path: ["periodEnd"], message: "Period end must not precede period start" });

activityRouter.get("/", async (req, res, next) => {
  const query = z.object({
    status: z.enum(["DRAFT","SUBMITTED","APPROVED","REJECTED"]).optional(),
    facilityId: z.string().uuid().optional(),
    category: z.enum(categories).optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().uuid().optional()
  }).safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid activity filters", details: query.error.flatten() } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const records = await withTenantContext(auth.organizationId, (tx) =>
      tx.activityRecord.findMany({
        where: {
          organizationId: auth.organizationId,
          ...(query.data.status ? { status: query.data.status } : {}),
          ...(query.data.facilityId ? { facilityId: query.data.facilityId } : {}),
          ...(query.data.category ? { category: query.data.category } : {}),
          ...(query.data.from || query.data.to ? { periodStart: { ...(query.data.from ? { gte: new Date(query.data.from) } : {}), ...(query.data.to ? { lte: new Date(query.data.to) } : {}) } } : {})
        },
        take: query.data.limit,
        ...(query.data.cursor ? { skip: 1, cursor: { id: query.data.cursor } } : {}),
        orderBy: [{ periodStart: "desc" }, { id: "desc" }],
        include: { facility: { select: { id: true, code: true, name: true } }, createdBy: { select: { id: true, name: true } } }
      })
    );
    res.status(200).json({ records, nextCursor: records.length === query.data.limit ? records[records.length - 1]?.id : null });
  } catch (error) { next(error); }
});

activityRouter.post("/", async (req, res, next) => {
  const parsed = createActivitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid activity record", details: parsed.error.flatten() } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const result = await withTenantContext(auth.organizationId, async (tx) => {
      const facility = await tx.facility.findFirst({ where: { id: parsed.data.facilityId, organizationId: auth.organizationId, isActive: true } });
      if (!facility) return null;
      const record = await tx.activityRecord.create({
        data: {
          ...parsed.data,
          organizationId: auth.organizationId,
          createdByUserId: auth.userId,
          quantity: new Prisma.Decimal(parsed.data.quantity),
          periodStart: new Date(parsed.data.periodStart),
          periodEnd: new Date(parsed.data.periodEnd)
        },
        include: { facility: { select: { id: true, code: true, name: true } } }
      });
      await tx.auditLog.create({
        data: { organizationId: auth.organizationId, actorUserId: auth.userId, action: "activity.created", resourceType: "activity_record", resourceId: record.id, metadata: { category: record.category, scope: record.scope, status: record.status } }
      });
      return record;
    });
    if (!result) {
      res.status(400).json({ error: { code: "FACILITY_UNAVAILABLE", message: "The selected facility is not active in this organization" } });
      return;
    }
    res.status(201).json({ record: result });
  } catch (error) { next(error); }
});

activityRouter.post("/:recordId/submit", async (req, res, next) => {
  const id = z.string().uuid().safeParse(req.params.recordId);
  if (!id.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid activity record ID" } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const result = await withTenantContext(auth.organizationId, async (tx) => {
      const updated = await tx.activityRecord.updateMany({
        where: { id: id.data, organizationId: auth.organizationId, createdByUserId: auth.userId, status: { in: ["DRAFT","REJECTED"] } },
        data: { status: "SUBMITTED", submittedAt: new Date(), reviewedAt: null, reviewedByUserId: null }
      });
      if (!updated.count) return false;
      await tx.auditLog.create({
        data: { organizationId: auth.organizationId, actorUserId: auth.userId, action: "activity.submitted", resourceType: "activity_record", resourceId: id.data }
      });
      return true;
    });
    if (!result) {
      res.status(409).json({ error: { code: "INVALID_ACTIVITY_STATE", message: "Only your draft or rejected activity records can be submitted" } });
      return;
    }
    res.status(200).json({ message: "Activity record submitted for review" });
  } catch (error) { next(error); }
});

activityRouter.post("/:recordId/review", requireRole("OWNER", "ADMIN", "AUDITOR"), async (req, res, next) => {
  const id = z.string().uuid().safeParse(req.params.recordId);
  const body = z.object({ decision: z.enum(["APPROVED","REJECTED"]), note: z.string().trim().max(1000).optional() }).safeParse(req.body);
  if (!id.success || !body.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid review request" } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const result = await withTenantContext(auth.organizationId, async (tx) => {
      const record = await tx.activityRecord.findFirst({ where: { id: id.data, organizationId: auth.organizationId, status: "SUBMITTED" } });
      if (!record || record.createdByUserId === auth.userId) return false;
      const updated = await tx.activityRecord.updateMany({
        where: { id: id.data, organizationId: auth.organizationId, status: "SUBMITTED" },
        data: { status: body.data.decision, reviewedByUserId: auth.userId, reviewedAt: new Date() }
      });
      if (!updated.count) return false;
      await tx.auditLog.create({
        data: { organizationId: auth.organizationId, actorUserId: auth.userId, action: "activity.reviewed", resourceType: "activity_record", resourceId: id.data, metadata: { decision: body.data.decision, note: body.data.note } }
      });
      return true;
    });
    if (!result) {
      res.status(409).json({ error: { code: "ACTIVITY_NOT_REVIEWABLE", message: "Record is not awaiting review or you cannot review your own submission" } });
      return;
    }
    res.status(200).json({ message: "Activity record reviewed", decision: body.data.decision });
  } catch (error) { next(error); }
});
