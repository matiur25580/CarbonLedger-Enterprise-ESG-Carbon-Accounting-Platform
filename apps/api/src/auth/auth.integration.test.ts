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
    await adminPrisma.activityRecord.deleteMany({ where: { organizationId: { in: createdOrganizations } } });
    await adminPrisma.emissionFactor.deleteMany({ where: { organizationId: { in: createdOrganizations } } });
    await adminPrisma.facility.deleteMany({ where: { organizationId: { in: createdOrganizations } } });
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

describe("facility, activity and factor tenancy", () => {
  it("creates source-backed records and prevents cross-organization visibility", async () => {
    const suffix = randomUUID();
    const account = await register({
      name: "ESG Data Owner",
      email: `esg-owner-${suffix}@example.test`,
      password: "EnterprisePass123",
      organizationName: "ESG Test Organization",
      organizationSlug: `esg-test-${suffix.slice(0, 8)}`
    });
    createdUsers.push(account.user.id);
    createdOrganizations.push(account.organization.id);

    const facility = await withTenantContext(account.organization.id, (tx) =>
      tx.facility.create({
        data: {
          organizationId: account.organization.id,
          code: "PLANT-01",
          name: "Primary Manufacturing Plant",
          countryCode: "IN",
          city: "Kolkata",
          createdByUserId: account.user.id
        }
      })
    );
    const factor = await withTenantContext(account.organization.id, (tx) =>
      tx.emissionFactor.create({
        data: {
          organizationId: account.organization.id,
          code: "GRID-IN",
          version: 1,
          name: "India grid electricity factor",
          category: "ELECTRICITY",
          scope: "SCOPE_2",
          unit: "kWh",
          geographyCode: "IN",
          kgCo2ePerUnit: "0.710000000000",
          sourceName: "Organization-approved factor source",
          sourceVersion: "2026.1",
          methodology: "Location-based electricity factor; illustrative test fixture, not an official published value.",
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          createdByUserId: account.user.id
        }
      })
    );
    const activity = await withTenantContext(account.organization.id, (tx) =>
      tx.activityRecord.create({
        data: {
          organizationId: account.organization.id,
          facilityId: facility.id,
          category: "ELECTRICITY",
          scope: "SCOPE_2",
          quantity: "1250.500000",
          unit: "kWh",
          periodStart: new Date("2026-10-01T00:00:00.000Z"),
          periodEnd: new Date("2026-10-31T00:00:00.000Z"),
          sourceName: "Utility invoice",
          sourceReference: "INV-TEST-001",
          createdByUserId: account.user.id
        }
      })
    );

    assert.equal(facility.countryCode, "IN");
    assert.equal(factor.status, "DRAFT");
    assert.equal(factor.version, 1);
    assert.equal(activity.status, "DRAFT");

    await withTenantContext(account.organization.id, (tx) =>
      tx.emissionFactor.update({
        where: { id: factor.id },
        data: { status: "PUBLISHED", publishedAt: new Date() }
      })
    );
    await assert.rejects(
      withTenantContext(account.organization.id, (tx) =>
        tx.emissionFactor.update({
          where: { id: factor.id },
          data: { kgCo2ePerUnit: "0.900000000000" }
        })
      )
    );
    const retiredFactor = await withTenantContext(account.organization.id, (tx) =>
      tx.emissionFactor.update({
        where: { id: factor.id },
        data: { status: "RETIRED" }
      })
    );
    assert.equal(retiredFactor.status, "RETIRED");

    const visibleActivity = await withTenantContext(account.organization.id, (tx) =>
      tx.activityRecord.findUnique({ where: { id: activity.id } })
    );
    assert.equal(visibleActivity?.id, activity.id);

    const invisibleActivity = await withTenantContext(randomUUID(), (tx) =>
      tx.activityRecord.findUnique({ where: { id: activity.id } })
    );
    assert.equal(invisibleActivity, null);
  });
});
