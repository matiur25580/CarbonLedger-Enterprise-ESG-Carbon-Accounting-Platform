import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { AuthRequest } from "../auth/auth.middleware.js";
import { withTenantContext } from "../auth/tenant-context.js";
import { analyzeActivityQuality } from "./data-quality.engine.js";

export const analyticsRouter = Router();
const filters = z.object({
  from: z.string().date(),
  to: z.string().date(),
  facilityId: z.string().uuid().optional()
}).strict().refine((value) => value.from <= value.to, "from must not follow to");

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

analyticsRouter.get("/overview", async (req, res, next) => {
  const parsed = filters.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide valid from/to dates and optional facilityId", details: parsed.error.flatten() } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const data = await withTenantContext(auth.organizationId, async (tx) => {
      const results = await tx.calculationResult.findMany({
        where: {
          organizationId: auth.organizationId,
          activity: {
            periodStart: { gte: new Date(parsed.data.from), lte: new Date(parsed.data.to) },
            ...(parsed.data.facilityId ? { facilityId: parsed.data.facilityId } : {})
          }
        },
        take: 10001,
        orderBy: { createdAt: "asc" },
        select: {
          id: true, kgCo2e: true, createdAt: true,
          activity: { select: { id: true, scope: true, category: true, periodStart: true, periodEnd: true, facilityId: true, facility: { select: { code: true, name: true } } } }
        }
      });
      const bounded = results.slice(0, 10000);
      const total = bounded.reduce((sum, row) => sum.plus(row.kgCo2e), new Prisma.Decimal(0));
      const scopes = new Map<string, Prisma.Decimal>();
      const categories = new Map<string, Prisma.Decimal>();
      const facilities = new Map<string, { name: string; kgCo2e: Prisma.Decimal }>();
      const months = new Map<string, Prisma.Decimal>();
      for (const row of bounded) {
        const amount = row.kgCo2e;
        scopes.set(row.activity.scope, (scopes.get(row.activity.scope) ?? new Prisma.Decimal(0)).plus(amount));
        categories.set(row.activity.category, (categories.get(row.activity.category) ?? new Prisma.Decimal(0)).plus(amount));
        const facility = facilities.get(row.activity.facilityId) ?? { name: row.activity.facility.name, kgCo2e: new Prisma.Decimal(0) };
        facility.kgCo2e = facility.kgCo2e.plus(amount);
        facilities.set(row.activity.facilityId, facility);
        const month = row.activity.periodStart.toISOString().slice(0, 7);
        months.set(month, (months.get(month) ?? new Prisma.Decimal(0)).plus(amount));
      }
      const [activeSuppliers, suppliersWithSubmissions, submissionCount, targets] = await Promise.all([
        tx.supplier.count({ where: { organizationId: auth.organizationId, status: "ACTIVE" } }),
        tx.supplier.count({ where: { organizationId: auth.organizationId, status: "ACTIVE", submissions: { some: {} } } }),
        tx.supplierSubmission.count({ where: { organizationId: auth.organizationId } }),
        tx.reductionTarget.findMany({
          where: { organizationId: auth.organizationId },
          orderBy: { targetYear: "asc" },
          include: { scenarios: { orderBy: { createdAt: "desc" }, take: 1 } }
        })
      ]);
      return {
        totalKgCo2e: total.toString(),
        calculationResultCount: bounded.length,
        truncated: results.length > 10000,
        byScope: [...scopes].map(([scope, kgCo2e]) => ({ scope, kgCo2e: kgCo2e.toString() })),
        byCategory: [...categories].map(([category, kgCo2e]) => ({ category, kgCo2e: kgCo2e.toString() })).sort((a, b) => Number(b.kgCo2e) - Number(a.kgCo2e)),
        byFacility: [...facilities].map(([facilityId, value]) => ({ facilityId, facilityName: value.name, kgCo2e: value.kgCo2e.toString() })).sort((a, b) => Number(b.kgCo2e) - Number(a.kgCo2e)),
        monthlyTrend: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, kgCo2e]) => ({ month, kgCo2e: kgCo2e.toString() })),
        supplierCoverage: { activeSuppliers, suppliersWithSubmissions, submissionCount, coveragePercent: activeSuppliers ? Number((suppliersWithSubmissions / activeSuppliers * 100).toFixed(2)) : 0 },
        reductionTargets: targets.map((target) => ({
          id: target.id, name: target.name, scope: target.scope, baselineYear: target.baselineYear,
          targetYear: target.targetYear, baselineKgCo2e: target.baselineKgCo2e.toString(),
          reductionPercent: target.reductionPercent.toString(),
          latestScenario: target.scenarios[0] ? {
            id: target.scenarios[0].id, projectedKgCo2e: target.scenarios[0].projectedKgCo2e.toString(),
            targetKgCo2e: target.scenarios[0].targetKgCo2e.toString(),
            targetMet: target.scenarios[0].projectedKgCo2e.lte(target.scenarios[0].targetKgCo2e)
          } : null
        }))
      };
    });
    res.status(200).json({ period: { from: parsed.data.from, to: parsed.data.to }, ...data });
  } catch (error) { next(error); }
});

analyticsRouter.get("/data-quality", async (req, res, next) => {
  const parsed = filters.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide valid from/to dates and optional facilityId", details: parsed.error.flatten() } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const result = await withTenantContext(auth.organizationId, async (tx) => {
      const rows = await tx.activityRecord.findMany({
        where: {
          organizationId: auth.organizationId,
          periodStart: { gte: new Date(parsed.data.from), lte: new Date(parsed.data.to) },
          ...(parsed.data.facilityId ? { facilityId: parsed.data.facilityId } : {})
        },
        take: 5001,
        orderBy: [{ periodStart: "asc" }, { id: "asc" }],
        select: {
          id: true, facilityId: true, category: true, scope: true, quantity: true, unit: true,
          periodStart: true, periodEnd: true, sourceName: true, sourceReference: true,
          status: true, createdAt: true, submittedAt: true,
          calculationResults: { select: { id: true }, take: 1 }
        }
      });
      const truncated = rows.length > 5000;
      const bounded = rows.slice(0, 5000);
      const analysis = analyzeActivityQuality(bounded.map((row) => ({
        ...row,
        quantity: row.quantity.toString(),
        hasCalculation: row.calculationResults.length > 0
      })));
      return { ...analysis, truncated, analyzedLimit: 5000 };
    });
    res.status(200).json({ period: { from: parsed.data.from, to: parsed.data.to }, ...result });
  } catch (error) { next(error); }
});

analyticsRouter.get("/emissions.csv", async (req, res, next) => {
  const parsed = filters.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide valid from/to dates and optional facilityId" } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const rows = await withTenantContext(auth.organizationId, (tx) => tx.calculationResult.findMany({
      where: {
        organizationId: auth.organizationId,
        activity: {
          periodStart: { gte: new Date(parsed.data.from), lte: new Date(parsed.data.to) },
          ...(parsed.data.facilityId ? { facilityId: parsed.data.facilityId } : {})
        }
      },
      take: 10000,
      orderBy: { activity: { periodStart: "asc" } },
      select: {
        id: true, kgCo2e: true, factorValue: true, factorUnit: true,
        run: { select: { engineVersion: true, createdAt: true } },
        factor: { select: { code: true, version: true, sourceName: true, sourceVersion: true } },
        activity: { select: { id: true, scope: true, category: true, quantity: true, unit: true, periodStart: true, periodEnd: true, facility: { select: { code: true, name: true } } } }
      }
    }));
    const header = ["activity_record_id","facility_code","facility_name","scope","category","quantity","unit","period_start","period_end","kg_co2e","factor_code","factor_version","factor_value","factor_unit","factor_source","factor_source_version","engine_version","calculated_at"];
    const lines = [header, ...rows.map((row) => [
      row.activity.id, row.activity.facility.code, row.activity.facility.name, row.activity.scope, row.activity.category,
      row.activity.quantity.toString(), row.activity.unit, row.activity.periodStart.toISOString().slice(0,10),
      row.activity.periodEnd.toISOString().slice(0,10), row.kgCo2e.toString(), row.factor.code, row.factor.version,
      row.factorValue.toString(), row.factorUnit, row.factor.sourceName, row.factor.sourceVersion,
      row.run.engineVersion, row.run.createdAt.toISOString()
    ])].map((line) => line.map(csvCell).join(",")).join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="carbonledger-emissions-${parsed.data.from}-to-${parsed.data.to}.csv"`);
    res.status(200).send(lines);
  } catch (error) { next(error); }
});
