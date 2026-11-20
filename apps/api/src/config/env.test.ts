import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { envSchema } from "./env.js";

describe("API environment schema", () => {
  it("accepts a valid PostgreSQL connection and port", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "test",
      API_PORT: "4100",
      WEB_ORIGIN: "http://localhost:5173",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/carbonledger"
    });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.API_PORT, 4100);
  });

  it("rejects an out-of-range API port", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "test",
      API_PORT: "70000",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/carbonledger"
    });
    assert.equal(result.success, false);
  });

  it("rejects a missing database URL", () => {
    const result = envSchema.safeParse({ NODE_ENV: "test" });
    assert.equal(result.success, false);
  });
});
