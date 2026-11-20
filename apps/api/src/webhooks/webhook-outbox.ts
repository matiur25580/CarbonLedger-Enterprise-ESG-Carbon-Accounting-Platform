import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

export async function enqueueWebhookEvent(
  tx: Prisma.TransactionClient,
  organizationId: string,
  eventType: string,
  payload: Prisma.InputJsonValue
): Promise<number> {
  const endpoints = await tx.webhookEndpoint.findMany({
    where: { organizationId, enabled: true, eventTypes: { has: eventType } },
    select: { id: true }
  });
  if (!endpoints.length) return 0;
  const eventId = randomUUID();
  const result = await tx.webhookDelivery.createMany({
    data: endpoints.map((endpoint) => ({
      organizationId,
      endpointId: endpoint.id,
      eventId,
      eventType,
      payload
    }))
  });
  return result.count;
}
