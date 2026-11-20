import assert from "node:assert/strict";
import test from "node:test";
import { createRequestId, safeRouteLabel } from "./request-context.js";

test("accepts a UUID correlation ID", () => {
  const id = "a0b1c2d3-e4f5-4678-9abc-def012345678";
  assert.equal(createRequestId(id), id);
});

test("replaces arbitrary or malformed correlation IDs", () => {
  assert.match(createRequestId("Bearer secret-token"), /^[0-9a-f-]{36}$/i);
  assert.match(createRequestId("not-a-uuid"), /^[0-9a-f-]{36}$/i);
});

test("uses route templates and never raw path parameters", () => {
  assert.equal(safeRouteLabel("/api/v1/suppliers", "/portal/:token"), "/api/v1/suppliers/portal/:token");
  assert.equal(safeRouteLabel("", undefined), "unmatched");
  assert.equal(safeRouteLabel("", "/"), "/");
});
