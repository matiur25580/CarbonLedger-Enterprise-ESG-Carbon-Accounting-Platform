import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { withTenantContext } from "../auth/tenant-context.js";
import { postWebhook, retryDelayMs, webhookWorkerLimits } from "./webhook-delivery.js";

type ClaimedDelivery = {
  id: string;
  organization_id: string;
  endpoint_id: string;
  event_id: string;
  event_type: string;
  payload: Prisma.JsonValue;
  attempts: number;
  locked_at: Date;
  url: string;
  secret_ciphertext: string;
  secret_iv: string;
  secret_auth_tag: string;
  endpoint_enabled: boolean;
};

const BATCH_SIZE = 5;
const POLL_INTERVAL_MS = 5_000;
const LEASE_TIMEOUT = "2 minutes";

async function claimForOrganization(organizationId: string): Promise<ClaimedDelivery[]> {
  return withTenantContext(organizationId, async (tx) => {
    await tx.$executeRaw`
      UPDATE webhook_deliveries
      SET status = 'FAILED', last_error = 'Maximum delivery attempts exhausted', locked_at = NULL
      WHERE organization_id = ${organizationId}::uuid
        AND attempts >= ${webhookWorkerLimits.maxAttempts}
        AND (
          (status = 'PENDING' AND next_attempt_at <= NOW())
          OR (status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '2 minutes')
        )
    `;
    return tx.$queryRaw<ClaimedDelivery[]>`
      WITH due AS (
        SELECT d.id
        FROM webhook_deliveries d
        WHERE d.organization_id = ${organizationId}::uuid
          AND d.attempts < ${webhookWorkerLimits.maxAttempts}
          AND (
            (d.status = 'PENDING' AND d.next_attempt_at <= NOW())
            OR (d.status = 'PROCESSING' AND d.locked_at < NOW() - INTERVAL '2 minutes')
          )
        ORDER BY d.next_attempt_at ASC, d.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${BATCH_SIZE}
      )
      UPDATE webhook_deliveries d
      SET status = 'PROCESSING', attempts = d.attempts + 1, locked_at = NOW(), last_error = NULL
      FROM due, webhook_endpoints e
      WHERE d.id = due.id AND e.id = d.endpoint_id AND e.organization_id = d.organization_id
      RETURNING d.id, d.organization_id, d.endpoint_id, d.event_id, d.event_type,
        d.payload, d.attempts, d.locked_at, e.url,
        e.secret_ciphertext, e.secret_iv, e.secret_auth_tag, e.enabled AS endpoint_enabled
    `;
  });
}

async function finishDelivery(delivery: ClaimedDelivery, outcome: { statusCode?: number; error?: string; permanentFailure?: boolean }) {
  await withTenantContext(delivery.organization_id, async (tx) => {
    if (outcome.statusCode !== undefined) {
      await tx.webhookDelivery.updateMany({
        where: { id: delivery.id, organizationId: delivery.organization_id, status: "PROCESSING", lockedAt: delivery.locked_at },
        data: { status: "DELIVERED", responseStatus: outcome.statusCode, deliveredAt: new Date(), lockedAt: null, lastError: null }
      });
      return;
    }
    const retryable = outcome.statusCode === undefined || outcome.statusCode === 408 || outcome.statusCode === 425 || outcome.statusCode === 429 || outcome.statusCode >= 500;
    const exhausted = delivery.attempts >= webhookWorkerLimits.maxAttempts || outcome.permanentFailure === true || !retryable;
    const delay = retryDelayMs(delivery.attempts);
    await tx.webhookDelivery.updateMany({
      where: { id: delivery.id, organizationId: delivery.organization_id, status: "PROCESSING", lockedAt: delivery.locked_at },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        nextAttemptAt: new Date(Date.now() + delay),
        lockedAt: null,
        lastError: (outcome.error ?? "Delivery failed").slice(0, 1000),
        ...(outcome.statusCode !== undefined ? { responseStatus: outcome.statusCode } : {})
      }
    });
  });
}

async function processDelivery(delivery: ClaimedDelivery): Promise<void> {
  if (!delivery.endpoint_enabled) {
    await finishDelivery(delivery, { error: "Webhook endpoint is disabled", permanentFailure: true });
    return;
  }
  try {
    const statusCode = await postWebhook({
      url: delivery.url,
      secretCiphertext: delivery.secret_ciphertext,
      secretIv: delivery.secret_iv,
      secretAuthTag: delivery.secret_auth_tag,
      eventId: delivery.event_id,
      eventType: delivery.event_type,
      payload: delivery.payload
    });
    await finishDelivery(delivery, { statusCode });
    console.info("Webhook delivered", { deliveryId: delivery.id, statusCode, attempt: delivery.attempts });
  } catch (error) {
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode: unknown }).statusCode) : undefined;
    const message = error instanceof Error ? error.message : "Unknown delivery failure";
    await finishDelivery(delivery, { error: message, ...(Number.isInteger(statusCode) ? { statusCode } : {}) });
    console.warn("Webhook delivery failed", { deliveryId: delivery.id, attempt: delivery.attempts, error: message });
  }
}

export async function runWebhookWorker(): Promise<void> {
  if (!process.env.WEBHOOK_ENCRYPTION_KEY) {
    console.info("Webhook delivery worker disabled: WEBHOOK_ENCRYPTION_KEY is not configured");
    return;
  }
  let stopping = false;
  let active = false;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.info("CarbonLedger webhook worker started");
  try {
    while (!stopping) {
      active = true;
      try {
        const organizations = await prisma.organization.findMany({ select: { id: true } });
        for (const organization of organizations) {
          if (stopping) break;
          const claimed = await claimForOrganization(organization.id);
          for (const delivery of claimed) {
            if (stopping) break;
            await processDelivery(delivery);
          }
        }
      } catch (error) {
        console.error("Webhook worker poll failed", error);
      } finally {
        active = false;
      }
      if (!stopping) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  } finally {
    // The current request is awaited before the loop observes SIGTERM. Leases
    // recover any row if the process is killed before it can persist an outcome.
    if (active) console.info("Webhook worker draining");
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    console.info("CarbonLedger webhook worker stopped");
  }
}
