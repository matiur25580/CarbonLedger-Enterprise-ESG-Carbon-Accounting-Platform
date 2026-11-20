import { Router } from "express";
import { z } from "zod";
import { AuthRequest, requireRole } from "../auth/auth.middleware.js";
import { withTenantContext } from "../auth/tenant-context.js";

export const facilityRouter = Router();

const createFacilitySchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(160),
  countryCode: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
  region: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  timezone: z.string().trim().min(1).max(80).default("UTC")
});

facilityRouter.get("/", async (req, res, next) => {
  try {
    const auth = (req as AuthRequest).auth!;
    const facilities = await withTenantContext(auth.organizationId, (tx) =>
      tx.facility.findMany({
        where: { organizationId: auth.organizationId },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: { id: true, code: true, name: true, countryCode: true, region: true, city: true, timezone: true, isActive: true, createdAt: true }
      })
    );
    res.status(200).json({ facilities });
  } catch (error) { next(error); }
});

facilityRouter.post("/", requireRole("OWNER", "ADMIN"), async (req, res, next) => {
  const parsed = createFacilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid facility details", details: parsed.error.flatten() } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const facility = await withTenantContext(auth.organizationId, async (tx) => {
      const created = await tx.facility.create({
        data: { ...parsed.data, code: parsed.data.code.toUpperCase(), organizationId: auth.organizationId, createdByUserId: auth.userId }
      });
      await tx.auditLog.create({
        data: { organizationId: auth.organizationId, actorUserId: auth.userId, action: "facility.created", resourceType: "facility", resourceId: created.id, metadata: { code: created.code } }
      });
      return created;
    });
    res.status(201).json({ facility });
  } catch (error) { next(error); }
});

facilityRouter.patch("/:facilityId/status", requireRole("OWNER", "ADMIN"), async (req, res, next) => {
  const id = z.string().uuid().safeParse(req.params.facilityId);
  const body = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!id.success || !body.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid facility ID or status" } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const facility = await withTenantContext(auth.organizationId, async (tx) => {
      const updated = await tx.facility.updateMany({
        where: { id: id.data, organizationId: auth.organizationId },
        data: { isActive: body.data.isActive }
      });
      if (!updated.count) return null;
      await tx.auditLog.create({
        data: { organizationId: auth.organizationId, actorUserId: auth.userId, action: "facility.status_changed", resourceType: "facility", resourceId: id.data, metadata: { isActive: body.data.isActive } }
      });
      return tx.facility.findFirst({ where: { id: id.data, organizationId: auth.organizationId } });
    });
    if (!facility) {
      res.status(404).json({ error: { code: "FACILITY_NOT_FOUND", message: "Facility not found" } });
      return;
    }
    res.status(200).json({ facility });
  } catch (error) { next(error); }
});
