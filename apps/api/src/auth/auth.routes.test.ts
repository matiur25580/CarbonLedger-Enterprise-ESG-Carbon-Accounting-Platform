import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerSchema, loginSchema } from "./auth.schemas.js";
import { hashRefreshToken, createRefreshToken } from "./tokens.js";

describe("authentication contracts", () => {
  it("requires strong registration passwords", () => {
    const result = registerSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      password: "weak",
      organizationName: "Example Org",
      organizationSlug: "example-org"
    });
    assert.equal(result.success, false);
  });

  it("normalizes email addresses", () => {
    const result = loginSchema.parse({ email: "TEST@EXAMPLE.COM", password: "secret" });
    assert.equal(result.email, "test@example.com");
  });

  it("generates opaque refresh tokens and stable one-way hashes", () => {
    const token = createRefreshToken();
    assert.ok(token.length >= 60);
    assert.equal(hashRefreshToken(token), hashRefreshToken(token));
    assert.notEqual(hashRefreshToken(token), token);
  });
});
