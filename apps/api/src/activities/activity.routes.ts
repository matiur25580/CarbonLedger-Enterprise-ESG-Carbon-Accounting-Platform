import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { AuthRequest, requireRole } from "../auth/auth.middleware.js";
import { withTenantContext } from "../auth/tenant-context.js";

export const activityRouter = Router();

const categories = ["ELECTRICITY","NATURAL_GAS","DIESEL","PETROL","LPG","REFRIGERANTS","COMPANY_VEHICLES","BUSINESS_TRAVEL","WASTE","WATER","PURCHASED_GOODS","FREIGHT","OTHER"] as const;
const scopes = ["SCOPE_1","SCOPE_2","SCOPE_3"] as const;
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { const parsed = new Date(value); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; }, "Invalid calendar date");
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
}).refine((value) => value.periodEnd >= value.periodStart, { path: ["periodEnd"], message: "Period end must not precede period start" }).refine((value) => { const expected: Record<string, string> = { ELECTRICITY: "SCOPE_2", NATURAL_GAS: "SCOPE_1", DIESEL: "SCOPE_1", PETROL: "SCOPE_1", LPG: "SCOPE_1", REFRIGERANTS: "SCOPE_1", COMPANY_VEHICLES: "SCOPE_1", BUSINESS_TRAVEL: "SCOPE_3", WASTE: "SCOPE_3", WATER: "SCOPE_3", PURCHASED_GOODS: "SCOPE_3", FREIGHT: "SCOPE_3" }; return !expected[value.category] || expected[value.category] === value.scope; }, { path: ["scope"], message: "Scope does not match the selected activity category" });

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
          ...(query.data.from ? { periodEnd: { gte: new Date(query.data.from) } } : {}),
          ...(query.data.to ? { periodStart: { lte: new Date(query.data.to) } } : {})
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

activityRouter.post("/", requireRole("OWNER", "ADMIN", "MEMBER"), async (req, res, next) => {
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

const updateActivitySchema = z.object({
  facilityId: z.string().uuid().optional(),
  category: z.enum(categories).optional(),
  scope: z.enum(scopes).optional(),
  quantity: z.number().finite().positive().max(1_000_000_000_000).optional(),
  unit: z.string().trim().min(1).max(40).optional(),
  periodStart: dateString.optional(),
  periodEnd: dateString.optional(),
  sourceName: z.string().trim().min(2).max(160).optional(),
  sourceReference: z.string().trim().max(240).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional()
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field must be supplied")
  .refine((value) => !value.periodStart || !value.periodEnd || value.periodEnd >= value.periodStart, { path: ["periodEnd"], message: "Period end must not precede period start" })
  .refine((value) => {
    const category = value.category;
    const scope = value.scope;
    if (!category || !scope) return true;
    const expected: Record<string, string> = { ELECTRICITY: "SCOPE_2", NATURAL_GAS: "SCOPE_1", DIESEL: "SCOPE_1", PETROL: "SCOPE_1", LPG: "SCOPE_1", REFRIGERANTS: "SCOPE_1", COMPANY_VEHICLES: "SCOPE_1", BUSINESS_TRAVEL: "SCOPE_3", WASTE: "SCOPE_3", WATER: "SCOPE_3", PURCHASED_GOODS: "SCOPE_3", FREIGHT: "SCOPE_3" };
    return !expected[category] || expected[category] === scope;
  }, { path: ["scope"], message: "Scope does not match the selected activity category" });

activityRouter.patch("/:recordId", requireRole("OWNER", "ADMIN", "MEMBER"), async (req, res, next) => {
  const id = z.string().uuid().safeParse(req.params.recordId);
  const parsed = updateActivitySchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid activity update", details: parsed.success ? undefined : parsed.error.flatten() } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const result = await withTenantContext(auth.organizationId, async (tx) => {
      const current = await tx.activityRecord.findFirst({
        where: { id: id.data, organizationId: auth.organizationId, createdByUserId: auth.userId, status: { in: ["DRAFT","REJECTED"] } }
      });
      if (!current) return null;
      if (parsed.data.facilityId) {
        const facility = await tx.facility.findFirst({ where: { id: parsed.data.facilityId, organizationId: auth.organizationId, isActive: true } });
        if (!facility) return false;
      }
      const updated = await tx.activityRecord.update({
        where: { id: id.data },
        data: {
          ...parsed.data,
          ...(parsed.data.quantity === undefined ? {} : { quantity: new Prisma.Decimal(parsed.data.quantity) }),
          ...(parsed.data.periodStart === undefined ? {} : { periodStart: new Date(parsed.data.periodStart) }),
          ...(parsed.data.periodEnd === undefined ? {} : { periodEnd: new Date(parsed.data.periodEnd) })
        }
      });
      await tx.auditLog.create({
        data: { organizationId: auth.organizationId, actorUserId: auth.userId, action: "activity.corrected", resourceType: "activity_record", resourceId: id.data, metadata: { status: updated.status } }
      });
      return updated;
    });
    if (result === false) {
      res.status(400).json({ error: { code: "FACILITY_UNAVAILABLE", message: "The selected facility is not active in this organization" } });
      return;
    }
    if (!result) {
      res.status(409).json({ error: { code: "ACTIVITY_NOT_EDITABLE", message: "Only your draft or rejected records can be corrected" } });
      return;
    }
    res.status(200).json({ record: result });
  } catch (error) { next(error); }
});

activityRouter.post("/:recordId/submit", requireRole("OWNER", "ADMIN", "MEMBER"), async (req, res, next) => {
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
