import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { AuthRequest, requireRole } from "../auth/auth.middleware.js";
import { withTenantContext } from "../auth/tenant-context.js";

export const emissionFactorRouter = Router();

const categories = ["ELECTRICITY","NATURAL_GAS","DIESEL","PETROL","LPG","REFRIGERANTS","COMPANY_VEHICLES","BUSINESS_TRAVEL","WASTE","WATER","PURCHASED_GOODS","FREIGHT","OTHER"] as const;
const scopes = ["SCOPE_1","SCOPE_2","SCOPE_3"] as const;
const dateString = z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).refine((value) => { const parsed = new Date(value); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; });
const createFactorSchema = z.object({
  code: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().trim().min(2).max(180),
  category: z.enum(categories),
  scope: z.enum(scopes),
  unit: z.string().trim().min(1).max(40),
  geographyCode: z.string().trim().min(2).max(12).transform((value) => value.toUpperCase()),
  kgCo2ePerUnit: z.string().regex(/^\d{1,12}(\.\d{1,12})?$/),
  sourceName: z.string().trim().min(2).max(180),
  sourceUrl: z.string().url().max(500).optional(),
  sourceVersion: z.string().trim().min(1).max(80),
  methodology: z.string().trim().min(10).max(2000),
  uncertaintyPercent: z.number().min(0).max(100).optional(),
  validFrom: dateString,
  validTo: dateString.optional()
}).refine((value) => !value.validTo || value.validTo >= value.validFrom, { path: ["validTo"], message: "Valid-to date must not precede valid-from date" });

emissionFactorRouter.get("/", async (req, res, next) => {
  const query = z.object({
    category: z.enum(categories).optional(),
    scope: z.enum(scopes).optional(),
    geographyCode: z.string().trim().min(2).max(12).optional(),
    status: z.enum(["DRAFT","PUBLISHED","RETIRED"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  }).safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid emission factor filters" } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const factors = await withTenantContext(auth.organizationId, (tx) =>
      tx.emissionFactor.findMany({
        where: {
          organizationId: auth.organizationId,
          ...(query.data.category ? { category: query.data.category } : {}),
          ...(query.data.scope ? { scope: query.data.scope } : {}),
          ...(query.data.geographyCode ? { geographyCode: query.data.geographyCode.toUpperCase() } : {}),
          ...(query.data.status ? { status: query.data.status } : {})
        },
        take: query.data.limit,
        orderBy: [{ code: "asc" }, { version: "desc" }]
      })
    );
    res.status(200).json({ factors });
  } catch (error) { next(error); }
});

emissionFactorRouter.post("/", requireRole("OWNER", "ADMIN"), async (req, res, next) => {
  const parsed = createFactorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid emission factor metadata", details: parsed.error.flatten() } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const factor = await withTenantContext(auth.organizationId, async (tx) => {
      const latest = await tx.emissionFactor.findFirst({
        where: { organizationId: auth.organizationId, code: parsed.data.code.toUpperCase() },
        orderBy: { version: "desc" },
        select: { version: true }
      });
      const created = await tx.emissionFactor.create({
        data: {
          ...parsed.data,
          code: parsed.data.code.toUpperCase(),
          organizationId: auth.organizationId,
          createdByUserId: auth.userId,
          version: (latest?.version ?? 0) + 1,
          kgCo2ePerUnit: new Prisma.Decimal(parsed.data.kgCo2ePerUnit),
          validFrom: new Date(parsed.data.validFrom),
          validTo: parsed.data.validTo ? new Date(parsed.data.validTo) : null,
          uncertaintyPercent: parsed.data.uncertaintyPercent === undefined ? null : new Prisma.Decimal(parsed.data.uncertaintyPercent)
        }
      });
      await tx.auditLog.create({
        data: { organizationId: auth.organizationId, actorUserId: auth.userId, action: "emission_factor.created", resourceType: "emission_factor", resourceId: created.id, metadata: { code: created.code, version: created.version, sourceName: created.sourceName } }
      });
      return created;
    });
    res.status(201).json({ factor });
  } catch (error) { next(error); }
});

emissionFactorRouter.post("/:factorId/publish", requireRole("OWNER", "ADMIN"), async (req, res, next) => {
  const id = z.string().uuid().safeParse(req.params.factorId);
  if (!id.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid factor ID" } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const factor = await withTenantContext(auth.organizationId, async (tx) => {
      const updated = await tx.emissionFactor.updateMany({
        where: { id: id.data, organizationId: auth.organizationId, status: "DRAFT" },
        data: { status: "PUBLISHED", publishedAt: new Date() }
      });
      if (!updated.count) return null;
      await tx.auditLog.create({
        data: { organizationId: auth.organizationId, actorUserId: auth.userId, action: "emission_factor.published", resourceType: "emission_factor", resourceId: id.data }
      });
      return tx.emissionFactor.findFirst({ where: { id: id.data, organizationId: auth.organizationId } });
    });
    if (!factor) {
      res.status(409).json({ error: { code: "FACTOR_NOT_PUBLISHABLE", message: "Only an unpublished draft factor can be published" } });
      return;
    }
    res.status(200).json({ factor });
  } catch (error) { next(error); }
});

emissionFactorRouter.post("/:factorId/retire", requireRole("OWNER", "ADMIN"), async (req, res, next) => {
  const id = z.string().uuid().safeParse(req.params.factorId);
  if (!id.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid factor ID" } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const factor = await withTenantContext(auth.organizationId, async (tx) => {
      const updated = await tx.emissionFactor.updateMany({
        where: { id: id.data, organizationId: auth.organizationId, status: "PUBLISHED" },
        data: { status: "RETIRED" }
      });
      if (!updated.count) return null;
      await tx.auditLog.create({
        data: { organizationId: auth.organizationId, actorUserId: auth.userId, action: "emission_factor.retired", resourceType: "emission_factor", resourceId: id.data }
      });
      return tx.emissionFactor.findFirst({ where: { id: id.data, organizationId: auth.organizationId } });
    });
    if (!factor) {
      res.status(409).json({ error: { code: "FACTOR_NOT_RETIRABLE", message: "Only a published factor can be retired" } });
      return;
    }
    res.status(200).json({ factor });
  } catch (error) { next(error); }
});
