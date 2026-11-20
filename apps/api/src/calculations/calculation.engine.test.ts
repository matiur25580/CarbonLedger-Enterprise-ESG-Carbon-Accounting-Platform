import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { calculateActivity, resolveUnitConversion, CalculationDomainError, selectEmissionFactor } from "./calculation.engine.js";

const activity = {
  id: "activity-1", category: "ELECTRICITY", scope: "SCOPE_2", quantity: new Prisma.Decimal("1.5"),
  unit: "MWh", periodStart: new Date("2026-01-01T00:00:00Z"), periodEnd: new Date("2026-01-31T00:00:00Z"),
  facility: { countryCode: "IN", city: "Kolkata", region: "West Bengal", code: "PLANT-1" }
};
const factor = (overrides: Record<string, unknown> = {}) => ({
  id: "factor-1", code: "GRID-IN", version: 1, name: "Grid factor", category: "ELECTRICITY", scope: "SCOPE_2",
  unit: "kWh", geographyCode: "IN", kgCo2ePerUnit: new Prisma.Decimal("0.82"), sourceName: "User-supplied source",
  sourceUrl: null, sourceVersion: "2026", methodology: "Organization-reviewed factor", validFrom: new Date("2026-01-01T00:00:00Z"),
  validTo: null, uncertaintyPercent: null, status: "PUBLISHED", ...overrides
});

test("converts MWh to kWh exactly and calculates with Decimal precision", () => {
  const conversion = resolveUnitConversion("MWh", "kWh");
  assert.equal(conversion?.multiplier, "1000");
  const result = calculateActivity(activity, factor() as never);
  assert.equal(result.normalizedQuantity.toString(), "1500");
  assert.equal(result.kgCo2e.toString(), "1230");
});

test("rejects unknown and cross-dimension units", () => {
  assert.equal(resolveUnitConversion("gallon", "kWh"), null);
  assert.equal(resolveUnitConversion("L", "kg"), null);
});

test("prefers country factor over global and rejects ambiguity", () => {
  const selected = selectEmissionFactor(activity as never, [factor({ id: "global", geographyCode: "GLOBAL" }), factor()] as never);
  assert.equal(selected.id, "factor-1");
  assert.throws(() => selectEmissionFactor(activity as never, [factor(), factor({ id: "factor-2" })] as never), (error: unknown) => error instanceof CalculationDomainError && error.code === "FACTOR_AMBIGUOUS");
});

test("fails closed when no date-valid published factor exists", () => {
  assert.throws(() => selectEmissionFactor(activity as never, [factor({ validFrom: new Date("2027-01-01T00:00:00Z") })] as never), (error: unknown) => error instanceof CalculationDomainError && error.code === "FACTOR_NOT_FOUND");
});
