import { randomUUID } from "node:crypto";
import { OrgRole, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createRefreshToken, hashRefreshToken, issueAccessToken } from "./tokens.js";
import { withTenantContext } from "./tenant-context.js";
import { withUserContext } from "./user-context.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function createSession(userId: string, organizationId: string) {
  const refreshToken = createRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.refreshToken.create({
    data: { userId, organizationId, tokenHash, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) }
  });
  return { accessToken: issueAccessToken({ sub: userId, organizationId, jti: randomUUID() }), refreshToken };
}

export async function register(input: {
  name: string; email: string; password: string; organizationName: string; organizationSlug: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new Error("EMAIL_IN_USE");
  const organizationId = randomUUID();
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await withTenantContext(organizationId, async (tx) => {
      const created = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash } });
      await tx.organization.create({ data: { id: organizationId, name: input.organizationName, slug: input.organizationSlug } });
      await tx.organizationMembership.create({ data: { organizationId, userId: created.id, role: OrgRole.OWNER } });
      await tx.auditLog.create({
        data: { organizationId, actorUserId: created.id, action: "organization.created", resourceType: "organization", resourceId: organizationId }
      });
      return created;
    });
    const session = await createSession(user.id, organizationId);
    return { user: { id: user.id, name: user.name, email: user.email }, organization: { id: organizationId, role: OrgRole.OWNER }, ...session };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("EMAIL_OR_SLUG_CONFLICT");
    }
    throw error;
  }
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new Error("INVALID_CREDENTIALS");
  }
  const membership = await withUserContext(user.id, (tx) =>
    tx.organizationMembership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: { organization: { select: { id: true, name: true, slug: true } } }
    })
  );
  if (!membership) throw new Error("NO_ACTIVE_ORGANIZATION");
  const session = await createSession(user.id, membership.organizationId);
  return { user: { id: user.id, name: user.name, email: user.email }, organization: { ...membership.organization, role: membership.role }, ...session };
}

// Rotate refresh credentials atomically so a token can only be consumed once.
export async function rotateRefreshToken(token: string) {
  const tokenHash = hashRefreshToken(token);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing || existing.revokedAt || existing.expiresAt <= new Date()) throw new Error("INVALID_REFRESH_TOKEN");

  const membership = await withUserContext(existing.userId, (tx) =>
    tx.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: existing.organizationId, userId: existing.userId } },
      select: { organizationId: true }
    })
  );
  if (!membership) throw new Error("NO_ACTIVE_ORGANIZATION");

  const nextToken = createRefreshToken();
  const nextHash = hashRefreshToken(nextToken);
  const rotated = await prisma.$transaction(async (tx) => {
    const result = await tx.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date(), replacedByTokenHash: nextHash }
    });
    if (result.count !== 1) return false;
    await tx.refreshToken.create({
      data: { userId: existing.userId, organizationId: existing.organizationId, tokenHash: nextHash, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) }
    });
    return true;
  });
  if (!rotated) throw new Error("INVALID_REFRESH_TOKEN");
  return { accessToken: issueAccessToken({ sub: existing.userId, organizationId: existing.organizationId, jti: randomUUID() }), refreshToken: nextToken };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({ where: { tokenHash: hashRefreshToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function listUserOrganizations(userId: string) {
  return withUserContext(userId, (tx) =>
    tx.organizationMembership.findMany({
      where: { userId },
      include: { organization: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: "asc" }
    })
  );
}

export async function switchOrganization(userId: string, organizationId: string, currentRefreshToken: string) {
  const membership = await withUserContext(userId, (tx) =>
    tx.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { organization: { select: { id: true, name: true, slug: true } } }
    })
  );
  if (!membership) throw new Error("ORGANIZATION_ACCESS_DENIED");
  await revokeRefreshToken(currentRefreshToken);
  const session = await createSession(userId, organizationId);
  return {
    organization: { ...membership.organization, role: membership.role },
    ...session
  };
}

export async function getCurrentOrganization(organizationId: string) {
  return withTenantContext(organizationId, (tx) =>
    tx.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, slug: true, createdAt: true } })
  );
}
