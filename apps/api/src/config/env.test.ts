import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { envSchema } from "./env-schema.js";

const validEnv = {
  NODE_ENV: "test",
  API_PORT: "4100",
  WEB_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/carbonledger",
  JWT_ACCESS_SECRET: "test-only-signing-secret-with-more-than-32-characters",
  COOKIE_SECURE: "false"
};

describe("API environment schema", () => {
  it("accepts valid PostgreSQL, API and authentication configuration", () => {
    const result = envSchema.safeParse(validEnv);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.API_PORT, 4100);
      assert.equal(result.data.COOKIE_SECURE, false);
    }
  });

  it("rejects an out-of-range API port", () => {
    const result = envSchema.safeParse({ ...validEnv, API_PORT: "70000" });
    assert.equal(result.success, false);
  });

  it("rejects a missing database URL", () => {
    const result = envSchema.safeParse({ ...validEnv, DATABASE_URL: undefined });
    assert.equal(result.success, false);
  });

  it("rejects a weak JWT signing secret", () => {
    const result = envSchema.safeParse({ ...validEnv, JWT_ACCESS_SECRET: "short" });
    assert.equal(result.success, false);
  });
});
