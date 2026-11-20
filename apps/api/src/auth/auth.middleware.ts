import type { NextFunction, Request, Response } from "express";
import { withTenantContext } from "./tenant-context.js";
import { verifyAccessToken } from "./tokens.js";

export interface AuthRequest extends Request {
  auth?: { userId: string; organizationId: string; role: "OWNER" | "ADMIN" | "MEMBER" | "AUDITOR"; email: string };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const request = req as AuthRequest;
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid access token is required" } });
    return;
  }

  try {
    const claims = verifyAccessToken(header.slice(7));
    const membership = await withTenantContext(claims.organizationId, (tx) =>
      tx.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId: claims.organizationId, userId: claims.sub } },
        include: { user: { select: { email: true, status: true } } }
      })
    );
    if (!membership || membership.user.status !== "ACTIVE") {
      res.status(401).json({ error: { code: "MEMBERSHIP_INACTIVE", message: "This account has no active membership in the selected organization" } });
      return;
    }
    request.auth = {
      userId: claims.sub,
      organizationId: claims.organizationId,
      role: membership.role,
      email: membership.user.email
    };
    next();
  } catch {
    res.status(401).json({ error: { code: "INVALID_TOKEN", message: "The access token is invalid or expired" } });
  }
}

export function requireRole(...allowed: Array<"OWNER" | "ADMIN" | "MEMBER" | "AUDITOR">) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = (req as AuthRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      return;
    }
    if (!allowed.includes(auth.role)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Your organization role cannot perform this action" } });
      return;
    }
    next();
  };
}
