import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AuthRequest, requireAuth, requireRole } from "../auth/auth.middleware.js";
import { withTenantContext } from "../auth/tenant-context.js";

export const organizationRouter = Router();
organizationRouter.use(requireAuth);

organizationRouter.get("/current/members", async (req, res) => {
  const auth = (req as AuthRequest).auth!;
  const members = await withTenantContext(auth.organizationId, (tx) =>
    tx.organizationMembership.findMany({
      where: { organizationId: auth.organizationId },
      select: { role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" }
    })
  );
  res.status(200).json({ members });
});

organizationRouter.patch("/current/members/:userId/role", requireRole("OWNER", "ADMIN"), async (req, res) => {
  const body = z.object({ role: z.enum(["ADMIN", "MEMBER", "AUDITOR"]) }).safeParse(req.body);
  const targetId = z.string().uuid().safeParse(req.params.userId);
  if (!body.success || !targetId.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid member ID or role" } });
    return;
  }
  const auth = (req as AuthRequest).auth!;
  const target = await withTenantContext(auth.organizationId, (tx) =>
    tx.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: auth.organizationId, userId: targetId.data } }
    })
  );
  if (!target) {
    res.status(404).json({ error: { code: "MEMBER_NOT_FOUND", message: "Organization member not found" } });
    return;
  }
  if (target.role === "OWNER" || (auth.role === "ADMIN" && body.data.role === "ADMIN")) {
    res.status(403).json({ error: { code: "ROLE_CHANGE_FORBIDDEN", message: "Only an owner can change administrator privileges" } });
    return;
  }
  await withTenantContext(auth.organizationId, async (tx) => {
    await tx.organizationMembership.update({
      where: { organizationId_userId: { organizationId: auth.organizationId, userId: targetId.data } },
      data: { role: body.data.role }
    });
    await tx.auditLog.create({
      data: { organizationId: auth.organizationId, actorUserId: auth.userId, action: "membership.role_updated", resourceType: "membership", resourceId: targetId.data, metadata: { role: body.data.role } }
    });
  });
  res.status(200).json({ message: "Member role updated" });
});
