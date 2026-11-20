import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function withTenantContext<T>(
  organizationId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${organizationId}, true)`;
    return callback(tx);
  });
}
