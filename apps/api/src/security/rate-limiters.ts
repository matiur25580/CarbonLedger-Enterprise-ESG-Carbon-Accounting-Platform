import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { PostgresRateLimitStore } from "./postgres-rate-limit-store.js";

// In-memory mode is suitable for local/single-process use only. Configure
// RATE_LIMIT_STORE=postgres on every API replica for shared distributed limits.
// PostgreSQL mode intentionally fails closed if its migration/table is missing.
const sharedStore = env.RATE_LIMIT_STORE === "postgres"
  ? new PostgresRateLimitStore()
  : undefined;

const common = {
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
  ...(sharedStore ? { store: sharedStore } : {}),
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests. Please retry after the rate-limit window."
    }
  }
};

export const apiRateLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 300
});

export const calculationRateLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 30
});

export const importRateLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20
});
