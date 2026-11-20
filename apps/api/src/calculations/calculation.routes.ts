import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { AuthRequest, requireRole } from "../auth/auth.middleware.js";
import { withTenantContext } from "../auth/tenant-context.js";
import { CALCULATION_ENGINE_VERSION, CalculationDomainError, calculateActivity, calculationFingerprint, selectEmissionFactor } from "./calculation.engine.js";

export const calculationRouter = Router();
const createSchema = z.object({ activityRecordIds: z.array(z.string().uuid()).min(1).max(100) }).strict().refine((value) => new Set(value.activityRecordIds).size === value.activityRecordIds.length, "Activity record IDs must be unique");

calculationRouter.post("/", requireRole("OWNER", "ADMIN", "MEMBER", "AUDITOR"), async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide 1–100 unique activityRecordIds", details: parsed.error.flatten() } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const result = await withTenantContext(auth.organizationId, async (tx) => {
      const activities = await tx.activityRecord.findMany({
        where: { organizationId: auth.organizationId, id: { in: parsed.data.activityRecordIds }, status: "APPROVED" },
        include: { facility: true }
      });
      if (activities.length !== parsed.data.activityRecordIds.length) {
        return { error: "ACTIVITY_NOT_APPROVED_OR_NOT_FOUND" as const };
      }
      const results = [];
      for (const activity of activities) {
        const factors = await tx.emissionFactor.findMany({
          where: {
            organizationId: auth.organizationId, category: activity.category, scope: activity.scope,
            status: "PUBLISHED", unit: { not: "" },
            geographyCode: { in: [activity.facility.countryCode, "GLOBAL"] },
            validFrom: { lte: activity.periodEnd },
            OR: [{ validTo: null }, { validTo: { gte: activity.periodEnd } }]
          }
        });
        const factor = selectEmissionFactor(activity, factors);
        const calculated = calculateActivity(activity, factor);
        const snapshot = {
          activity: { id: activity.id, category: activity.category, scope: activity.scope, quantity: activity.quantity.toString(), unit: activity.unit, periodStart: activity.periodStart.toISOString(), periodEnd: activity.periodEnd.toISOString(), facilityCode: activity.facility.code, facilityCountry: activity.facility.countryCode },
          factor: { id: factor.id, code: factor.code, version: factor.version, name: factor.name, unit: factor.unit, geographyCode: factor.geographyCode, kgCo2ePerUnit: factor.kgCo2ePerUnit.toString(), sourceName: factor.sourceName, sourceUrl: factor.sourceUrl, sourceVersion: factor.sourceVersion, methodology: factor.methodology, validFrom: factor.validFrom.toISOString(), validTo: factor.validTo?.toISOString() ?? null, uncertaintyPercent: factor.uncertaintyPercent?.toString() ?? null },
          conversion: calculated.conversion, engineVersion: CALCULATION_ENGINE_VERSION
        };
        results.push({
          organizationId: auth.organizationId, activityRecordId: activity.id, emissionFactorId: factor.id,
          activityQuantity: activity.quantity, activityUnit: activity.unit,
          normalizedQuantity: calculated.normalizedQuantity, factorUnit: factor.unit,
          conversionMultiplier: calculated.multiplier, conversionPath: calculated.conversion.path,
          factorValue: factor.kgCo2ePerUnit, kgCo2e: calculated.kgCo2e, snapshot
        });
      }
      const factorSignature = results.map((item) => `${item.emissionFactorId}:${item.factorValue.toString()}`).sort().join("|");
      const fingerprint = calculationFingerprint(auth.organizationId, activities, "facility-country", factorSignature);
      const existing = await tx.calculationRun.findFirst({
        where: { organizationId: auth.organizationId, fingerprint },
        include: { results: { include: { factor: { select: { code: true, version: true, sourceName: true, sourceVersion: true } } } } }
      });
      if (existing) return { run: existing, reused: true };
      const run = await tx.calculationRun.create({
        data: { organizationId: auth.organizationId, fingerprint, engineVersion: CALCULATION_ENGINE_VERSION, requestedCount: activities.length, createdByUserId: auth.userId, results: { create: results } },
        include: { results: { include: { factor: { select: { code: true, version: true, sourceName: true, sourceVersion: true } } } } }
      });
      await tx.auditLog.create({
        data: { organizationId: auth.organizationId, actorUserId: auth.userId, action: "calculation.run_created", resourceType: "calculation_run", resourceId: run.id, metadata: { fingerprint, engineVersion: CALCULATION_ENGINE_VERSION, resultCount: results.length } }
      });
      return { run, reused: false };
    });
    if ("error" in result) {
      res.status(422).json({ error: { code: result.error, message: "All requested activity records must exist in this organization and be approved" } });
      return;
    }
    res.status(result.reused ? 200 : 201).json({ run: result.run, reused: result.reused });
  } catch (error) {
    if (error instanceof CalculationDomainError) {
      res.status(422).json({ error: { code: error.code, message: error.message } });
      return;
    }
    next(error);
  }
});

calculationRouter.get("/", async (req, res, next) => {
  const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid limit" } }); return; }
  try {
    const auth = (req as AuthRequest).auth!;
    const runs = await withTenantContext(auth.organizationId, (tx) => tx.calculationRun.findMany({
      where: { organizationId: auth.organizationId }, take: query.data.limit,
      orderBy: { createdAt: "desc" }, include: { results: true }
    }));
    res.status(200).json({ runs });
  } catch (error) { next(error); }
});

calculationRouter.get("/:runId", async (req, res, next) => {
  const id = z.string().uuid().safeParse(req.params.runId);
  if (!id.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid calculation run ID" } }); return; }
  try {
    const auth = (req as AuthRequest).auth!;
    const run = await withTenantContext(auth.organizationId, (tx) => tx.calculationRun.findFirst({
      where: { id: id.data, organizationId: auth.organizationId }, include: { results: true }
    }));
    if (!run) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Calculation run not found" } }); return; }
    res.status(200).json({ run });
  } catch (error) { next(error); }
});
