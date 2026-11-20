import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRefreshToken, hashRefreshToken, issueAccessToken, verifyAccessToken } from "./tokens.js";

describe("token lifecycle", () => {
  it("issues audience-bound access tokens", () => {
    const token = issueAccessToken({
      sub: "a2d6e0a0-1a1a-4f6c-8c21-4a0c2d6f0b11",
      organizationId: "b2d6e0a0-1a1a-4f6c-8c21-4a0c2d6f0b11",
      jti: "session-id"
    });
    assert.equal(verifyAccessToken(token).sub, "a2d6e0a0-1a1a-4f6c-8c21-4a0c2d6f0b11");
  });

  it("creates opaque refresh tokens and one-way hashes", () => {
    const token = createRefreshToken();
    assert.ok(token.length > 50);
    assert.equal(hashRefreshToken(token).length, 64);
    assert.notEqual(hashRefreshToken(token), token);
  });
});
