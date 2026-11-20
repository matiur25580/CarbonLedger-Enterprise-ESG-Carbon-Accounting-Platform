import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

export const CALCULATION_ENGINE_VERSION = "1.0.0";

export type UnitConversion = { multiplier: string; path: string[] };

// Deliberately small, explicit conversion registry. Unknown units fail closed.
const unitDefinitions: Record<string, { dimension: string; baseMultiplier: string }> = {
  Wh: { dimension: "energy", baseMultiplier: "0.001" },
  kWh: { dimension: "energy", baseMultiplier: "1" },
  MWh: { dimension: "energy", baseMultiplier: "1000" },
  GWh: { dimension: "energy", baseMultiplier: "1000000" },
  kg: { dimension: "mass", baseMultiplier: "1" },
  tonne: { dimension: "mass", baseMultiplier: "1000" },
  t: { dimension: "mass", baseMultiplier: "1000" },
  g: { dimension: "mass", baseMultiplier: "0.001" },
  L: { dimension: "volume", baseMultiplier: "1" },
  m3: { dimension: "volume", baseMultiplier: "1000" }
};

export function resolveUnitConversion(fromUnit: string, toUnit: string): UnitConversion | null {
  if (fromUnit === toUnit) return { multiplier: "1", path: [fromUnit] };
  const from = unitDefinitions[fromUnit];
  const to = unitDefinitions[toUnit];
  if (!from || !to || from.dimension !== to.dimension) return null;
  const multiplier = new Prisma.Decimal(from.baseMultiplier).div(to.baseMultiplier);
  return { multiplier: multiplier.toString(), path: [fromUnit, toUnit] };
}

type FactorCandidate = {
  id: string; code: string; version: number; name: string; category: string; scope: string;
  unit: string; geographyCode: string; kgCo2ePerUnit: Prisma.Decimal;
  sourceName: string; sourceUrl: string | null; sourceVersion: string; methodology: string;
  validFrom: Date; validTo: Date | null; uncertaintyPercent: Prisma.Decimal | null;
};
type ActivityInput = {
  id: string; category: string; scope: string; quantity: Prisma.Decimal; unit: string;
  periodStart: Date; periodEnd: Date; facility: { countryCode: string; city: string | null; region: string | null; code: string };
};

export class CalculationDomainError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export function selectEmissionFactor(activity: ActivityInput, factors: FactorCandidate[]): FactorCandidate {
  const eligible = factors.filter((factor) =>
    factor.category === activity.category && factor.scope === activity.scope &&
    factor.status === "PUBLISHED" &&
    factor.validFrom <= activity.periodEnd &&
    (factor.validTo === null || factor.validTo >= activity.periodEnd)
  );
  const exact = eligible.filter((factor) => factor.geographyCode === activity.facility.countryCode);
  const global = eligible.filter((factor) => factor.geographyCode === "GLOBAL");
  const preferred = exact.length ? exact : global;
  if (!preferred.length) throw new CalculationDomainError("FACTOR_NOT_FOUND", `No published, date-valid factor matches activity ${activity.id}`);
  if (preferred.length > 1) throw new CalculationDomainError("FACTOR_AMBIGUOUS", `More than one equally specific factor matches activity ${activity.id}`);
  return preferred[0]!;
}

export function calculateActivity(activity: ActivityInput, factor: FactorCandidate) {
  const conversion = resolveUnitConversion(activity.unit, factor.unit);
  if (!conversion) throw new CalculationDomainError("UNIT_MISMATCH", `No supported conversion from ${activity.unit} to ${factor.unit}`);
  const multiplier = new Prisma.Decimal(conversion.multiplier);
  const normalizedQuantity = activity.quantity.mul(multiplier);
  const kgCo2e = normalizedQuantity.mul(factor.kgCo2ePerUnit);
  return { conversion, multiplier, normalizedQuantity, kgCo2e };
}

export function calculationFingerprint(organizationId: string, records: Array<{ id: string; updatedAt: Date; quantity: Prisma.Decimal; unit: string }>, geography: string) {
  const canonical = [...records].sort((a, b) => a.id.localeCompare(b.id)).map((record) =>
    [record.id, record.updatedAt.toISOString(), record.quantity.toString(), record.unit]
  );
  return createHash("sha256").update(JSON.stringify({ organizationId, geography, engine: CALCULATION_ENGINE_VERSION, records: canonical })).digest("hex");
}
