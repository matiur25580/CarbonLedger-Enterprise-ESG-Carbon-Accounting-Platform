import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { AuthRequest, requireRole } from "../auth/auth.middleware.js";
import { withTenantContext } from "../auth/tenant-context.js";

export const auditRouter = Router();
auditRouter.use(requireRole("OWNER", "ADMIN", "AUDITOR"));

const dateRange = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional()
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: "from must not follow to"
});

const listQuery = dateRange.extend({
  action: z.string().min(1).max(120).optional(),
  resourceType: z.string().min(1).max(80).optional(),
  actorUserId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0)
}).strict();

const exportQuery = z.object({
  from: z.string().date(),
  to: z.string().date(),
  action: z.string().min(1).max(120).optional(),
  resourceType: z.string().min(1).max(80).optional()
}).strict().refine((value) => value.from <= value.to, {
  message: "from must not follow to"
});

type AuditExportRow = {
  id: string;
  createdAt: Date;
  actorUserId: string | null;
  actor: { name: string; email: string } | null;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: unknown;
};

export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildAuditCsv(rows: AuditExportRow[]): string {
  const header = [
    "audit_event_id", "occurred_at", "actor_user_id", "actor_name",
    "actor_email", "action", "resource_type", "resource_id", "metadata_json"
  ];
  const lines = rows.map((row) => [
    row.id, row.createdAt.toISOString(), row.actorUserId, row.actor?.name,
    row.actor?.email, row.action, row.resourceType, row.resourceId,
    JSON.stringify(row.metadata ?? {})
  ]);
  return [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

auditRouter.get("/events", async (req, res, next) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid audit filters", details: parsed.error.flatten() } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const { from, to, action, resourceType, actorUserId, limit, offset } = parsed.data;
    const where = {
      organizationId: auth.organizationId,
      ...(from || to ? { createdAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lt: new Date(new Date(to).getTime() + 86400000) } : {})
      } } : {}),
      ...(action ? { action } : {}),
      ...(resourceType ? { resourceType } : {}),
      ...(actorUserId ? { actorUserId } : {})
    };
    const result = await withTenantContext(auth.organizationId, async (tx) => {
      const [events, total] = await Promise.all([
        tx.auditLog.findMany({
          where, skip: offset, take: limit, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true, actorUserId: true, action: true, resourceType: true,
            resourceId: true, metadata: true, createdAt: true,
            actor: { select: { name: true, email: true } }
          }
        }),
        tx.auditLog.count({ where })
      ]);
      return { events, total };
    });
    res.status(200).json({
      events: result.events,
      page: { limit, offset, total: result.total, hasMore: offset + result.events.length < result.total }
    });
  } catch (error) { next(error); }
});

auditRouter.get("/export.csv", async (req, res, next) => {
  const parsed = exportQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide a valid date range and optional action/resourceType filters", details: parsed.error.flatten() } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const rows = await withTenantContext(auth.organizationId, (tx) => tx.auditLog.findMany({
      where: {
        organizationId: auth.organizationId,
        createdAt: { gte: new Date(parsed.data.from), lt: new Date(new Date(parsed.data.to).getTime() + 86400000) },
        ...(parsed.data.action ? { action: parsed.data.action } : {}),
        ...(parsed.data.resourceType ? { resourceType: parsed.data.resourceType } : {})
      },
      take: 5001,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true, actorUserId: true, action: true, resourceType: true,
        resourceId: true, metadata: true, createdAt: true,
        actor: { select: { name: true, email: true } }
      }
    }));
    if (rows.length > 5000) {
      res.status(413).json({ error: { code: "EXPORT_TOO_LARGE", message: "More than 5,000 audit events matched. Narrow the date range or filters." } });
      return;
    }
    const csv = buildAuditCsv(rows);
    const digest = sha256Hex(csv);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="carbonledger-audit-${parsed.data.from}-to-${parsed.data.to}.csv"`);
    res.setHeader("X-Content-SHA256", digest);
    res.setHeader("X-Export-Record-Count", String(rows.length));
    res.setHeader("X-Export-Organization", auth.organizationId);
    res.status(200).send(csv);
  } catch (error) { next(error); }
});
