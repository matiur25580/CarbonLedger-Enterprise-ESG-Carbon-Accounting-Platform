import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { register, rotateRefreshToken, switchOrganization } from "./auth.service.js";
import { verifyAccessToken } from "./tokens.js";
import { withTenantContext } from "./tenant-context.js";

const createdUsers: string[] = [];
const createdOrganizations: string[] = [];
const adminPrisma = env.DATABASE_ADMIN_URL
  ? new PrismaClient({ datasources: { db: { url: env.DATABASE_ADMIN_URL } } })
  : null;

after(async () => {
  if (adminPrisma && createdOrganizations.length) {
    await adminPrisma.auditLog.deleteMany({ where: { organizationId: { in: createdOrganizations } } });
    await adminPrisma.organization.deleteMany({ where: { id: { in: createdOrganizations } } });
  }
  if (adminPrisma && createdUsers.length) {
    await adminPrisma.user.deleteMany({ where: { id: { in: createdUsers } } });
  }
  await prisma.$disconnect();
  await adminPrisma?.$disconnect();
});

describe("identity and tenant isolation integration", () => {
  it("registers organizations, rotates sessions and blocks cross-tenant reads", async () => {
    const runtimeRole = await prisma.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    assert.equal(runtimeRole[0]?.rolsuper, false);
    assert.equal(runtimeRole[0]?.rolbypassrls, false);

    const suffix = randomUUID();
    const first = await register({
      name: "Tenant One Admin",
      email: `tenant-one-${suffix}@example.test`,
      password: "EnterprisePass123",
      organizationName: "Tenant One",
      organizationSlug: `tenant-one-${suffix.slice(0, 8)}`
    });
    createdUsers.push(first.user.id);
    createdOrganizations.push(first.organization.id);

    const second = await register({
      name: "Tenant Two Admin",
      email: `tenant-two-${suffix}@example.test`,
      password: "EnterprisePass123",
      organizationName: "Tenant Two",
      organizationSlug: `tenant-two-${suffix.slice(0, 8)}`
    });
    createdUsers.push(second.user.id);
    createdOrganizations.push(second.organization.id);

    const hiddenOrganization = await withTenantContext(first.organization.id, (tx) =>
      tx.organization.findUnique({ where: { id: second.organization.id } })
    );
    assert.equal(hiddenOrganization, null);

    const auditEvents = await withTenantContext(first.organization.id, (tx) =>
      tx.auditLog.findMany({ where: { organizationId: first.organization.id } })
    );
    assert.ok(auditEvents.length > 0);
    await assert.rejects(
      withTenantContext(first.organization.id, (tx) =>
        tx.auditLog.updateMany({
          where: { organizationId: first.organization.id },
          data: { action: "audit.tampered" }
        })
      )
    );

    await withTenantContext(second.organization.id, (tx) =>
      tx.organizationMembership.create({
        data: { organizationId: second.organization.id, userId: first.user.id, role: "MEMBER" }
      })
    );

    const switched = await switchOrganization(first.user.id, second.organization.id, first.refreshToken);
    const rotated = await rotateRefreshToken(switched.refreshToken);
    assert.equal(verifyAccessToken(rotated.accessToken).organizationId, second.organization.id);
  });
});
