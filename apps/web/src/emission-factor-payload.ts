export type EmissionFactorDraftPayload = {
  code: string;
  name: string;
  category: string;
  scope: string;
  unit: string;
  geographyCode: string;
  kgCo2ePerUnit: string;
  sourceName: string;
  sourceUrl: string;
  sourceVersion: string;
  methodology: string;
  validFrom: string;
  validTo: string;
};

export function buildEmissionFactorPayload(draft: EmissionFactorDraftPayload) {
  const { sourceUrl, validTo, ...requiredFields } = draft;
  return {
    ...requiredFields,
    ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
    ...(validTo.trim() ? { validTo: validTo.trim() } : {}),
  };
}
