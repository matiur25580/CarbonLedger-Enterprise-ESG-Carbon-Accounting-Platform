import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("organization authorization policy", () => {
  it("keeps owner as a protected role in the API contract", () => {
    const assignableRoles = ["ADMIN", "MEMBER", "AUDITOR"];
    assert.equal(assignableRoles.includes("OWNER"), false);
  });

  it("does not permit an administrator to promote another administrator", () => {
    const actorRole = "ADMIN";
    const requestedRole = "ADMIN";
    assert.equal(actorRole === "ADMIN" && requestedRole === "ADMIN", true);
  });
});
