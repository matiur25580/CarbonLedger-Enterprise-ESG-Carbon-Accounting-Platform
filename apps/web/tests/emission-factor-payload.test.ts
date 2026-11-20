import assert from "node:assert/strict";
import test from "node:test";
import { buildEmissionFactorPayload } from "../src/emission-factor-payload.ts";

const draft = {
  code: "GRID-IN",
  name: "Grid electricity",
  category: "ELECTRICITY",
  scope: "SCOPE_2",
  unit: "kWh",
  geographyCode: "IN",
  kgCo2ePerUnit: "0.72",
  sourceName: "Authoritative source",
  sourceUrl: "",
  sourceVersion: "2026",
  methodology: "Documented lifecycle methodology.",
  validFrom: "2026-01-01",
  validTo: "",
};

test("omits blank optional source URL and valid-to date", () => {
  const payload = buildEmissionFactorPayload(draft);
  assert.equal("sourceUrl" in payload, false);
  assert.equal("validTo" in payload, false);
  assert.equal(payload.code, draft.code);
});

test("trims and preserves supplied optional fields", () => {
  const payload = buildEmissionFactorPayload({
    ...draft,
    sourceUrl: "  https://example.com/factors  ",
    validTo: " 2026-12-31 ",
  });
  assert.equal(payload.sourceUrl, "https://example.com/factors");
  assert.equal(payload.validTo, "2026-12-31");
});

test("omits whitespace-only optional fields", () => {
  const payload = buildEmissionFactorPayload({
    ...draft,
    sourceUrl: "   ",
    validTo: "   ",
  });
  assert.equal("sourceUrl" in payload, false);
  assert.equal("validTo" in payload, false);
});
