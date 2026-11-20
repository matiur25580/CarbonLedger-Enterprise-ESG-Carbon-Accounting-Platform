import assert from "node:assert/strict";
import test from "node:test";
import { envSchema } from "../config/env-schema.js";

const base = {
  NODE_ENV: "test",
  APP_DATABASE_URL: "postgresql://app:secret@localhost:5432/carbonledger",
  JWT_ACCESS_SECRET: "test-only-secret-that-is-long-enough-123"
};

test("rate limit store defaults to process-local memory", () => {
  const parsed = envSchema.parse(base);
  assert.equal(parsed.RATE_LIMIT_STORE, "memory");
});

test("accepts PostgreSQL as the shared rate limit store", () => {
  const parsed = envSchema.parse({ ...base, RATE_LIMIT_STORE: "postgres" });
  assert.equal(parsed.RATE_LIMIT_STORE, "postgres");
});

test("rejects unsupported rate limit store values", () => {
  assert.equal(envSchema.safeParse({ ...base, RATE_LIMIT_STORE: "redis" }).success, false);
});
