import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { Router } from "express";
import { z } from "zod";
import { AuthRequest, requireRole } from "../auth/auth.middleware.js";
import { withTenantContext } from "../auth/tenant-context.js";
import { env } from "../config/env.js";
import { encryptWebhookSecret } from "./webhook-crypto.js";

export const webhookRouter = Router();
const uuid = z.string().uuid();
const eventName = z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*){1,5}$/).max(120);
const endpointBody = z.object({
  url: z.string().url().max(2048),
  eventTypes: z.array(eventName).min(1).max(20)
}).strict().superRefine((value, ctx) => {
  try {
    const url = new URL(value.url);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host.endsWith(".internal") || isIP(host)) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "Webhook URLs must use a public HTTPS hostname without credentials or fragments" });
    }
  } catch {
    ctx.addIssue({ code: "custom", path: ["url"], message: "Provide a valid HTTPS URL" });
  }
}).refine((value) => new Set(value.eventTypes).size === value.eventTypes.length, {
  path: ["eventTypes"], message: "Event types must be unique"
});

webhookRouter.post("/endpoints", requireRole("OWNER", "ADMIN"), async (req, res, next) => {
  const body = endpointBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid webhook endpoint", details: body.error.flatten() } });
    return;
  }
  if (!env.WEBHOOK_ENCRYPTION_KEY) {
    res.status(503).json({ error: { code: "WEBHOOKS_NOT_CONFIGURED", message: "Set WEBHOOK_ENCRYPTION_KEY before registering endpoints" } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const signingSecret = randomBytes(32).toString("base64url");
    const encrypted = encryptWebhookSecret(signingSecret);
    const endpoint = await withTenantContext(auth.organizationId, async (tx) => {
      const created = await tx.webhookEndpoint.create({
        data: {
          organizationId: auth.organizationId,
          createdByUserId: auth.userId,
          url: body.data.url,
          eventTypes: body.data.eventTypes,
          ...encrypted
        },
        select: { id: true, url: true, eventTypes: true, enabled: true, createdAt: true }
      });
      await tx.auditLog.create({ data: {
        organizationId: auth.organizationId, actorUserId: auth.userId,
        action: "webhook.endpoint_created", resourceType: "webhook_endpoint",
        resourceId: created.id, metadata: { eventTypes: created.eventTypes }
      }});
      return created;
    });
    res.status(201).json({
      endpoint,
      signingSecret,
      warning: "Store this signing secret now; it is shown only once. Delivery is queued until a worker is deployed."
    });
  } catch (error) { next(error); }
});

webhookRouter.get("/endpoints", requireRole("OWNER", "ADMIN", "MEMBER", "AUDITOR"), async (req, res, next) => {
  try {
    const auth = (req as AuthRequest).auth!;
    const endpoints = await withTenantContext(auth.organizationId, (tx) => tx.webhookEndpoint.findMany({
      where: { organizationId: auth.organizationId },
      orderBy: { createdAt: "desc" },
      select: { id: true, url: true, eventTypes: true, enabled: true, createdAt: true, updatedAt: true }
    }));
    res.status(200).json({ endpoints });
  } catch (error) { next(error); }
});

webhookRouter.patch("/endpoints/:endpointId/disable", requireRole("OWNER", "ADMIN"), async (req, res, next) => {
  const id = uuid.safeParse(req.params.endpointId);
  if (!id.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid endpoint ID" } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const endpoint = await withTenantContext(auth.organizationId, async (tx) => {
      const changed = await tx.webhookEndpoint.updateMany({
        where: { id: id.data, organizationId: auth.organizationId, enabled: true },
        data: { enabled: false }
      });
      if (!changed.count) return null;
      await tx.auditLog.create({ data: {
        organizationId: auth.organizationId, actorUserId: auth.userId,
        action: "webhook.endpoint_disabled", resourceType: "webhook_endpoint",
        resourceId: id.data, metadata: {}
      }});
      return tx.webhookEndpoint.findFirst({
        where: { id: id.data, organizationId: auth.organizationId },
        select: { id: true, url: true, eventTypes: true, enabled: true, updatedAt: true }
      });
    });
    if (!endpoint) {
      res.status(404).json({ error: { code: "WEBHOOK_ENDPOINT_NOT_FOUND", message: "Enabled endpoint not found" } });
      return;
    }
    res.status(200).json({ endpoint });
  } catch (error) { next(error); }
});

webhookRouter.get("/deliveries", requireRole("OWNER", "ADMIN", "MEMBER", "AUDITOR"), async (req, res, next) => {
  const query = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    status: z.enum(["PENDING", "PROCESSING", "DELIVERED", "FAILED"]).optional()
  }).strict().safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid delivery filters" } });
    return;
  }
  try {
    const auth = (req as AuthRequest).auth!;
    const deliveries = await withTenantContext(auth.organizationId, (tx) => tx.webhookDelivery.findMany({
      where: { organizationId: auth.organizationId, ...(query.data.status ? { status: query.data.status } : {}) },
      take: query.data.limit,
      orderBy: { createdAt: "desc" },
      select: { id: true, endpointId: true, eventId: true, eventType: true, status: true, attempts: true, nextAttemptAt: true, responseStatus: true, lastError: true, deliveredAt: true, createdAt: true }
    }));
    res.status(200).json({ deliveries });
  } catch (error) { next(error); }
});
