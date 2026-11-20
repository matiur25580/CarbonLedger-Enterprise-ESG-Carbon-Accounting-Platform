import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Accept only UUID-shaped correlation IDs; never reflect arbitrary header input into logs. */
export function createRequestId(candidate?: string): string {
  return candidate && UUID_PATTERN.test(candidate) ? candidate : randomUUID();
}

/** Route templates avoid logging path parameters such as supplier invitation tokens. */
export function safeRouteLabel(baseUrl: string, routePath: unknown): string {
  if (typeof routePath !== "string" || !routePath.startsWith("/")) return "unmatched";
  return `${baseUrl}${routePath}`.slice(0, 256);
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = createRequestId(req.header("x-request-id"));
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const route = safeRouteLabel(req.baseUrl, req.route?.path);
    // Deliberately omit raw URL, query string, headers, body, IP and user identifiers.
    console.info(JSON.stringify({
      level: "info",
      event: "http.request.completed",
      requestId,
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs: Math.round(elapsedMs * 100) / 100
    }));
  });

  next();
}
