import { rateLimit } from "express-rate-limit";

// These in-memory limits protect a single API process. Use a shared store
// (for example Redis) before horizontally scaling multiple API instances.
const common = {
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
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
